import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";
import { BRIDGE_URL, CHAINS, DEADLINE_SECS, SLIPPAGE_BPS, type Chain, type Token } from "./config.ts";
import { abi, minOut, quoteCall, routes, swapCall } from "./swap.ts";
import { STYLE } from "./style.ts";

// Wallet-only: the Freenet sandbox blocks fetch to external RPCs, so every read and write goes through the wallet.
type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown> };

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

// A wallet that never answers (e.g. blocked inside the Freenet sandbox) must surface as an error, not a stuck button.
const rpc = <T>(method: string, params: unknown[] = [], ms = 20_000) => {
  return Promise.race([
    bridge.request({ method, params }) as Promise<T>,
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
    <button id="how" class="link" type="button">How it works</button>
    <p class="muted">Uniswap V3, served from Freenet. Unaudited: use small amounts.</p>
    <p class="love"><a href="https://github.com/scobru/freeswap" target="_blank" rel="noopener noreferrer">github.com/scobru/freeswap</a> · Made with <span aria-label="love">♥</span> by <a href="https://scobrudot.dev" target="_blank" rel="noopener noreferrer">scobru</a></p>
  </footer>
  <dialog id="howto" aria-labelledby="howTitle">
    <h2 id="howTitle">How it works</h2>
    <ol class="flow">
      <li><b>Freenet</b><span>serves this page from a contract, in a sandboxed frame. No server, no domain to take down.</span></li>
      <li><b>Wallet popup</b><span>a small page on GitHub Pages. Wallet extensions can't reach the sandbox, so the popup talks to your wallet and relays each request.</span></li>
      <li><b>Your wallet</b><span>reads the chain and asks you to confirm every transaction. Keys never leave it.</span></li>
      <li><b>Uniswap V3</b><span>on Ethereum or Base: quotes from QuoterV2, swaps through SwapRouter02.</span></li>
    </ol>
    <h3>Safety</h3>
    <ul>
      <li>The popup only passes on reads, chain switches to Ethereum or Base, token approvals for the Uniswap router, and swaps that pay out to you. Everything else is refused.</li>
      <li>On connect the page checks the Uniswap contracts and every token's decimals onchain.</li>
      <li>Each quote tries every fee tier and a route through WETH, and keeps the best. You get at least the minimum shown (${Number(SLIPPAGE_BPS) / 100}% slippage) or the swap reverts.</li>
      <li>Approvals are for the exact amount, never unlimited.</li>
    </ul>
    <h3>Privacy</h3>
    <p class="muted">Swaps are public onchain, like on any DEX. Your wallet's RPC provider and GitHub Pages see your IP; Freenet keeps the app itself uncensorable.</p>
    <form method="dialog"><button class="primary" type="submit">Got it</button></form>
  </dialog>`;

let chain: Chain = CHAINS[0], tin: Token = chain.tokens[0], tout: Token = chain.tokens[1];
let account: Address | undefined, bal = 0n, amountIn = 0n, allowance = 0n, busy = false;
let best: { path: Hex; out: bigint; hops: number } | undefined;
const verified = new Set<string>(); // chain ids whose contracts and tokens passed preflight this session
const ready = () => !!account && verified.has(chain.id);
const say = (t: string, link?: string) => { $("msg").textContent = t; if (link) $("msg").append(" ", Object.assign(document.createElement("a"), { href: link, target: "_blank", rel: "noopener", textContent: "View" })); };
const confirmIn = () => "the wallet popup (click its button)";
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
const parse = () => { try { const v = parseUnits($<HTMLInputElement>("amt").value.trim() || "0", tin.decimals); return v > 0n ? v : 0n; } catch { return 0n; } };

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

let seq = 0; // a slow quote for an older amount or pair must not overwrite a newer one
async function refresh() {
  const mine = ++seq;
  amountIn = parse();
  best = undefined;
  if (ready()) {
    try {
      const [b, a] = await Promise.all([balanceOf(tin), tin.native ? 0n : read(tin.address, "allowance", [account, chain.router])]);
      const q = amountIn > 0n ? await quote(amountIn) : undefined;
      if (mine !== seq) return;
      [bal, allowance, best] = [b, a, q];
    } catch (e) { if (mine === seq) say((e as Error).message); }
  }
  if (mine === seq) render();
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
  const hash = await rpc<Hex>("eth_sendTransaction", [{ from: account, to, data, value: "0x" + value.toString(16), chainId: chain.id }], 180_000);
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
$("amt").addEventListener("input", () => { seq++; amountIn = parse(); best = undefined; render(); clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 400); });
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
$("how").addEventListener("click", () => $<HTMLDialogElement>("howto").showModal());
render();
