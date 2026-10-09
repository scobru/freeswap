import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";
import { BRIDGE_URL, CHAINS, DEADLINE_SECS, SLIPPAGE_BPS, type Chain, type Token } from "./config.ts";
import { abi, minOut, quoteCall, routes, swapCall } from "./swap.ts";
import { STYLE } from "./style.ts";

// Wallet-only: the Freenet sandbox blocks fetch to external RPCs, so every read and write goes through the wallet.
type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown> };
const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum;

// Wallet extensions can't answer inside the Freenet sandbox (opaque origin), so bridge.html, served from a normal
// origin and opened as a popup, relays each request to the wallet there.
const BRIDGE_ORIGIN = new URL(BRIDGE_URL).origin;
let popup: Window | null = null, popupReady: Promise<void> | undefined, onReady = () => {}, nextId = 1;
const waiting = new Map<number, (m: { result?: unknown; error?: { code?: number; message?: string } }) => void>();
addEventListener("message", (e) => {
  if (!popup || e.source !== popup || e.origin !== BRIDGE_ORIGIN) return;
  const id = e.data?.freeswapBridge;
  if (id === "ready") onReady();
  else if (id === "closed") popup = null;
  else { waiting.get(id)?.(e.data); waiting.delete(id); }
});
const bridge: Eip1193 = {
  request({ method, params }) {
    if (!popup || popup.closed) {
      // A fresh URL each time: browsers kept serving a stale bridge.html (whose old script was gone) after a deploy.
      popup = window.open(`${BRIDGE_URL}?t=${Date.now()}`, "freeswap-bridge", "popup,width=420,height=600"); // needs this click's user activation
      if (!popup) return Promise.reject(new Error("The wallet popup was blocked. Allow popups for FreeSwap and try again."));
      popupReady = new Promise((r) => (onReady = r));
    }
    const id = nextId++;
    return popupReady!.then(() => new Promise((ok, no) => {
      waiting.set(id, (m) => (m.error ? no(Object.assign(new Error(m.error.message), m.error)) : ok(m.result)));
      popup!.focus(); // best effort: brings the popup forward when the browser allows it
      popup!.postMessage({ id, method, params }, BRIDGE_ORIGIN);
    }));
  },
};

// EIP-6963: several wallet extensions can be installed and only one owns window.ethereum, so let the user pick.
const wallets: { name: string; provider: Eip1193 }[] = [{ name: "Wallet in popup", provider: bridge }, ...(legacy ? [{ name: "window.ethereum", provider: legacy }] : [])];
let eth: Eip1193 | undefined = bridge;
// A wallet that never answers (e.g. blocked inside the Freenet sandbox) must surface as an error, not a stuck button.
const rpc = <T>(method: string, params: unknown[] = [], ms = 20_000) => {
  if (!eth) throw new Error("No wallet found");
  return Promise.race([
    eth.request({ method, params }) as Promise<T>,
    new Promise<never>((_, no) => setTimeout(() => no(new Error(`Wallet did not answer ${method} within ${ms / 1000}s.`)), ms)),
  ]);
};
const ethCall = (to: Address, data: Hex) => rpc<Hex>("eth_call", [{ to, data }, "latest"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (to: Address, functionName: string, args: unknown[] = []): Promise<any> =>
  decodeFunctionResult({ abi, functionName: functionName as never, data: await ethCall(to, encodeFunctionData({ abi, functionName: functionName as never, args: args as never })) });

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.head.append(Object.assign(document.createElement("style"), { textContent: STYLE }));
$("app").innerHTML = `
  <header>
    <div class="brand"><span class="logo">⇄</span>FreeSwap</div>
    <nav id="chains" class="pills"></nav>
  </header>
  <section class="card">
    <div class="box">
      <div class="line"><span>You pay</span><button id="bal" class="link" type="button"></button></div>
      <div class="line"><input id="amt" inputmode="decimal" placeholder="0" autocomplete="off" aria-label="Amount to pay"><select id="tin" aria-label="Token to pay"></select></div>
    </div>
    <button id="flip" class="flip" type="button" aria-label="Swap direction">↓</button>
    <div class="box">
      <div class="line"><span>You receive</span><span id="routeInfo" class="muted"></span></div>
      <div class="line"><output id="out">0</output><select id="tout" aria-label="Token to receive"></select></div>
    </div>
    <dl id="details" class="details" hidden>
      <div><dt>Rate</dt><dd id="rate"></dd></div>
      <div><dt>Minimum received</dt><dd id="min"></dd></div>
      <div><dt>Slippage</dt><dd>${Number(SLIPPAGE_BPS) / 100}%</dd></div>
    </dl>
    <button id="go" class="primary" type="button">Connect wallet</button>
    <p id="msg" role="status"></p>
  </section>
  <footer>
    <label>Wallet <select id="wallet"></select></label>
    <button id="diag" class="link" type="button">Diagnose wallet</button>
    <p class="muted">Uniswap V3, served from Freenet. Unaudited: use small amounts.</p>
  </footer>`;

let chain: Chain = CHAINS[0], tin: Token = chain.tokens[0], tout: Token = chain.tokens[1];
let account: Address | undefined, bal = 0n, amountIn = 0n, allowance = 0n, busy = false;
let best: { path: Hex; out: bigint; hops: number } | undefined;
const verified = new Set<string>(); // chain ids whose contracts and tokens passed preflight this session
const ready = () => !!account && verified.has(chain.id);
const say = (t: string, link?: string) => { $("msg").textContent = t; if (link) $("msg").append(" ", Object.assign(document.createElement("a"), { href: link, target: "_blank", rel: "noopener", textContent: "View" })); };
const confirmIn = () => (eth === bridge ? "the wallet popup (click its button)" : "your wallet");
const fmt = (v: bigint, d: number) => { const [i, f = ""] = formatUnits(v, d).split("."); return f ? `${i}.${f.slice(0, 6).replace(/0+$/, "")}`.replace(/\.$/, "") : i; };

async function preflight(c: Chain): Promise<string[]> {
  const bad: string[] = [];
  const codes = await Promise.all([c.factory, c.quoter, c.router, c.weth].map((a) => rpc<string>("eth_getCode", [a, "latest"])));
  if (codes.includes("0x")) return [`missing Uniswap contract on ${c.name}`];
  if (getAddress(await read(c.router, "WETH9")) !== getAddress(c.weth)) bad.push("router.WETH9() is not the configured WETH");
  if (getAddress(await read(c.quoter, "factory")) !== getAddress(c.factory)) bad.push("quoter.factory() is not the configured factory");
  const decs = await Promise.all(c.tokens.filter((t) => !t.native).map(async (t) => [t, Number(await read(t.address, "decimals"))] as const));
  for (const [t, d] of decs) if (d !== t.decimals) bad.push(`${t.symbol} decimals mismatch`);
  return bad;
}

async function ensureChain() {
  if ((await rpc<string>("eth_chainId")) !== chain.id) {
    say(`Switch your wallet to ${chain.name} in ${confirmIn()}…`);
    await rpc("wallet_switchEthereumChain", [{ chainId: chain.id }], 60_000);
  }
  if ((await rpc<string>("eth_chainId")) !== chain.id) throw new Error(`Wallet is not on ${chain.name}`);
  if (verified.has(chain.id)) return;
  const bad = await preflight(chain);
  if (bad.length) throw new Error("Safety check failed, swap disabled:\n- " + bad.join("\n- "));
  verified.add(chain.id);
}

const balanceOf = async (t: Token) => (t.native ? BigInt(await rpc<string>("eth_getBalance", [account, "latest"])) : (read(t.address, "balanceOf", [account]) as Promise<bigint>));
const parse = () => { try { return parseUnits($<HTMLInputElement>("amt").value.trim() || "0", tin.decimals); } catch { return 0n; } };

async function quote(amount: bigint) {
  const quotes = await Promise.allSettled(routes(chain, tin, tout).map(async (path) => ({ path, out: decodeFunctionResult({ abi, functionName: "quoteExactInput", data: await ethCall(chain.quoter, quoteCall(path, amount)) })[0] })));
  const ok = quotes.flatMap((q) => (q.status === "fulfilled" ? [q.value] : []));
  if (!ok.length) throw new Error(`No Uniswap pool for ${tin.symbol} → ${tout.symbol} on ${chain.name}`);
  const top = ok.reduce((a, b) => (b.out > a.out ? b : a));
  return { ...top, hops: (top.path.length - 42) / 46 }; // 20-byte token + 3-byte fee per hop, as hex
}

function render() {
  $("chains").replaceChildren(...CHAINS.map((c) => Object.assign(document.createElement("button"), { type: "button", textContent: c.name, className: c === chain ? "on" : "", onclick: () => void pickChain(c) })));
  for (const [id, cur] of [["tin", tin], ["tout", tout]] as const)
    $<HTMLSelectElement>(id).replaceChildren(...chain.tokens.map((t) => new Option(t.symbol, t.symbol, false, t === cur)));
  $("bal").textContent = ready() ? `Balance ${fmt(bal, tin.decimals)} · Max` : "";
  $("out").textContent = best ? fmt(best.out, tout.decimals) : "0";
  $("routeInfo").textContent = best ? (best.hops > 1 ? `via WETH · ${best.hops} pools` : "direct pool") : "";
  $("details").hidden = !best;
  if (best) {
    const rate = (best.out * 10n ** BigInt(tin.decimals)) / (amountIn || 1n);
    $("rate").textContent = `1 ${tin.symbol} = ${fmt(rate, tout.decimals)} ${tout.symbol}`;
    $("min").textContent = `${fmt(minOut(best.out, SLIPPAGE_BPS), tout.decimals)} ${tout.symbol}`;
  }
  const go = $<HTMLButtonElement>("go");
  go.disabled = busy || (ready() && (amountIn === 0n || amountIn > bal || !best));
  go.textContent = !account ? "Connect wallet" : !ready() ? `Switch to ${chain.name}` : amountIn === 0n ? "Enter an amount" : amountIn > bal ? `Insufficient ${tin.symbol}` : !best ? "No route" : !tin.native && amountIn > allowance ? `Approve ${tin.symbol}` : "Swap";
}

async function refresh() {
  amountIn = parse();
  best = undefined;
  if (ready()) {
    try {
      [bal, allowance] = await Promise.all([balanceOf(tin), tin.native ? 0n : read(tin.address, "allowance", [account, chain.router])]);
      if (amountIn > 0n) best = await quote(amountIn);
    } catch (e) { say((e as Error).message); }
  }
  render();
}

async function pickChain(c: Chain) {
  if (busy || c === chain) return;
  chain = c; tin = c.tokens[0]; tout = c.tokens[1]; $<HTMLInputElement>("amt").value = ""; say("");
  render();
  if (account) await run(async () => { await ensureChain(); say(""); });
  else void refresh();
}

async function connect() {
  say(`Approve the connection in ${confirmIn()}…`);
  account = getAddress((await rpc<Address[]>("eth_requestAccounts", [], 60_000))[0]);
  await ensureChain();
  say(`Connected ${account.slice(0, 6)}…${account.slice(-4)} on ${chain.name}`);
}

async function wait(hash: Hex) {
  for (let i = 0; i < 90; i++) {
    const r = await rpc<{ status: string } | null>("eth_getTransactionReceipt", [hash]);
    if (r) { if (r.status !== "0x1") throw new Error("Transaction reverted: " + hash); return; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for " + hash);
}
async function send(to: Address, data: Hex, value = 0n) {
  const hash = await rpc<Hex>("eth_sendTransaction", [{ from: account, to, data, value: "0x" + value.toString(16) }], 180_000);
  say("Pending…", chain.explorer + hash);
  await wait(hash);
  return hash;
}
const approve = (amount: bigint) => send(tin.address, encodeFunctionData({ abi, functionName: "approve", args: [chain.router, amount] }));

async function swapNow() {
  await ensureChain();
  amountIn = parse();
  if (!tin.native && amountIn > allowance) {
    // USDT-style tokens refuse to change a nonzero allowance, so a leftover one is cleared first.
    if (allowance > 0n) { say(`Reset the old ${tin.symbol} approval in ${confirmIn()}…`); await approve(0n); }
    say(`Approve ${fmt(amountIn, tin.decimals)} ${tin.symbol} in ${confirmIn()}…`);
    await approve(amountIn); // exact amount, not infinite
    say(`${tin.symbol} approved. Now press Swap.`);
    return;
  }
  const q = await quote(amountIn); // fresh quote: the shown one may be stale
  const { data, value } = swapCall(tin, tout, q.path, account!, amountIn, q.out, SLIPPAGE_BPS, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECS));
  say(`Confirm the swap in ${confirmIn()}…`);
  const hash = await send(chain.router, data, value);
  $<HTMLInputElement>("amt").value = "";
  say(`Swapped ${fmt(amountIn, tin.decimals)} ${tin.symbol} for at least ${fmt(minOut(q.out, SLIPPAGE_BPS), tout.decimals)} ${tout.symbol}.`, chain.explorer + hash);
}

async function run(task: () => Promise<void>) {
  busy = true; render();
  try { await task(); } catch (e) { say(String((e as { message?: string }).message ?? e)); }
  busy = false;
  await refresh().catch(() => undefined);
}

let timer: number | undefined;
$("amt").addEventListener("input", () => { amountIn = parse(); best = undefined; render(); clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 400); });
// Picking the token already on the other side swaps the two, as on Uniswap.
const pick = (side: "tin" | "tout") => (e: Event) => {
  const t = chain.tokens.find((x) => x.symbol === (e.target as HTMLSelectElement).value)!;
  if (side === "tin") [tin, tout] = [t, t === tout ? tin : tout];
  else [tout, tin] = [t, t === tin ? tout : tin];
  void refresh();
};
$("tin").addEventListener("change", pick("tin"));
$("tout").addEventListener("change", pick("tout"));
$("flip").addEventListener("click", () => { [tin, tout] = [tout, tin]; $<HTMLInputElement>("amt").value = ""; void refresh(); });
// shortcut: Max on ETH keeps 1% back for gas, a rough reserve; estimate the fee if users hit "insufficient funds".
$("bal").addEventListener("click", () => { $<HTMLInputElement>("amt").value = formatUnits(tin.native ? (bal * 99n) / 100n : bal, tin.decimals); void refresh(); });
$("go").addEventListener("click", () => void run(!account ? connect : !ready() ? ensureChain : swapNow));
// Facts about what the Freenet sandbox lets a wallet do, so we can pick a workaround without console sessions.
$("diag").addEventListener("click", async () => {
  const w = window.open("about:blank"); // first: popups need the click's user activation
  w?.close();
  const flags = ["isMetaMask", "isPhantom", "isRabby", "isBraveWallet", "isCoinbaseWallet"].filter((k) => (legacy as unknown as Record<string, unknown> | undefined)?.[k]);
  const lines = [
    `origin: ${window.origin}, framed: ${window.top !== window}`,
    `window.ethereum: ${legacy ? flags.join(",") || "present, unknown wallet" : "none"}`,
    `EIP-6963 wallets: ${wallets.slice(legacy ? 2 : 1).map((x) => x.name).join(", ") || "none"}`,
    `window.open: ${w ? "allowed" : "blocked"}`,
  ];
  say(lines.join("\n"));
  try { lines.push("eth_chainId: " + (await rpc<string>("eth_chainId", [], 5000))); } catch (e) { lines.push("eth_chainId: " + (e as Error).message); }
  say(lines.join("\n"));
});
const sel = $("wallet") as HTMLSelectElement;
const fill = () => { const i = Math.max(sel.selectedIndex, 0); sel.replaceChildren(...wallets.map((w, j) => new Option(w.name, String(j)))); sel.selectedIndex = i; eth = wallets[i]?.provider; };
sel.addEventListener("change", () => { eth = wallets[sel.selectedIndex].provider; account = undefined; say(""); void refresh(); });
addEventListener("eip6963:announceProvider", (e) => {
  const d = (e as CustomEvent<{ info: { name: string }; provider: Eip1193 }>).detail;
  if (!wallets.some((w) => w.name === d.info.name)) { wallets.push({ name: d.info.name, provider: d.provider }); fill(); }
});
dispatchEvent(new Event("eip6963:requestProvider"));
fill();
