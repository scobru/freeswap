import { decodeFunctionResult, encodeFunctionData, formatUnits, getAddress, parseUnits, type Address, type Hex } from "viem";
import { ADDR, BRIDGE_URL, CHAIN_ID_HEX, DEADLINE_SECS, FEE, SLIPPAGE_BPS } from "./config.ts";
import { abi, quoteCall, swapCall, type Dir } from "./swap.ts";

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
      popup = window.open(BRIDGE_URL, "freeswap-bridge", "popup,width=420,height=600"); // needs this click's user activation
      if (!popup) return Promise.reject(new Error("The wallet popup was blocked. Allow popups for FreeSwap and try again."));
      popupReady = new Promise((r) => (onReady = r));
    }
    const id = nextId++;
    return popupReady!.then(() => new Promise((ok, no) => {
      waiting.set(id, (m) => (m.error ? no(Object.assign(new Error(m.error.message), m.error)) : ok(m.result)));
      popup!.postMessage({ id, method, params }, BRIDGE_ORIGIN);
    }));
  },
};

// EIP-6963: several wallet extensions can be installed and only one owns window.ethereum, so let the user pick.
const wallets: { name: string; provider: Eip1193 }[] = [{ name: "Wallet in popup", provider: bridge }, ...(legacy ? [{ name: "window.ethereum", provider: legacy }] : [])];
let eth: Eip1193 | undefined = bridge;
// A wallet that never answers (e.g. blocked inside the Freenet sandbox) must surface as an error, not a stuck button.
const rpc = <T>(method: string, params: unknown[] = [], ms = 20_000) => {
  if (!eth) throw new Error("No wallet found (window.ethereum)");
  return Promise.race([
    eth.request({ method, params }) as Promise<T>,
    new Promise<never>((_, no) => setTimeout(() => no(new Error(`Wallet did not answer ${method} within ${ms / 1000}s. The Freenet sandbox may be blocking the wallet.`)), ms)),
  ]);
};
const ethCall = (to: Address, data: Hex) => rpc<Hex>("eth_call", [{ to, data }, "latest"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (to: Address, functionName: string, args: unknown[] = []): Promise<any> =>
  decodeFunctionResult({ abi, functionName: functionName as never, data: await ethCall(to, encodeFunctionData({ abi, functionName: functionName as never, args: args as never })) });

const $ = (id: string) => document.getElementById(id)!;
$("app").innerHTML = `
  <h1>FreeSwap</h1>
  <p class="sub">Uniswap V3 on Base, served from Freenet. Unaudited: use small amounts.</p>
  <label>Wallet <select id="wallet"></select></label>
  <label>You pay <span id="bal"></span></label>
  <div class="row"><input id="amt" inputmode="decimal" placeholder="0.0" autocomplete="off"><b id="symIn">ETH</b></div>
  <button id="flip" type="button">&#8645;</button>
  <label>You receive (min after ${Number(SLIPPAGE_BPS) / 100}% slippage)</label>
  <div class="row"><output id="out">-</output><b id="symOut">USDC</b></div>
  <button id="go" type="button">Connect wallet</button>
  <p id="msg" role="status"></p>
  <button id="diag" type="button">Diagnose wallet</button>`;
const style = document.createElement("style");
style.textContent = `body{font:16px system-ui;max-width:26rem;margin:2rem auto;padding:0 16px}
.row{display:flex;gap:8px;align-items:center;margin:4px 0 12px}input{flex:1;font-size:1.2rem;padding:8px}
output{flex:1;font-size:1.2rem;padding:8px}button{width:100%;padding:12px;font-size:1rem}#flip{width:auto;margin:0 auto 12px;display:block}
#msg{white-space:pre-wrap;word-break:break-all}.sub{color:#666}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}.sub{color:#aaa}}`;
document.head.append(style);

const say = (t: string) => ($("msg").textContent = t);
let dir: Dir = "eth-usdc", account: Address | undefined, quote = 0n, amountIn = 0n, allowance = 0n, ready = false, busy = false;
const dec = (d: Dir) => (d === "eth-usdc" ? 18 : 6);
const sym = (d: Dir) => (d === "eth-usdc" ? ["ETH", "USDC"] : ["USDC", "ETH"]);

async function preflight(): Promise<string[]> {
  const bad: string[] = [];
  for (const [k, a] of Object.entries(ADDR)) if ((await rpc<string>("eth_getCode", [a, "latest"])) === "0x") bad.push(`${k}: no contract at ${a}`);
  if (bad.length) return bad;
  if (getAddress(await read(ADDR.router, "WETH9")) !== getAddress(ADDR.weth)) bad.push("router.WETH9() is not the configured WETH");
  if (getAddress(await read(ADDR.quoter, "factory")) !== getAddress(ADDR.factory)) bad.push("quoter.factory() is not the configured factory");
  if (/^0x0*$/.test(await read(ADDR.factory, "getPool", [ADDR.weth, ADDR.usdc, FEE]))) bad.push("WETH/USDC pool not found");
  if ((await read(ADDR.usdc, "symbol")) !== "USDC" || Number(await read(ADDR.usdc, "decimals")) !== 6) bad.push("USDC token mismatch");
  return bad;
}

async function ensureChain() {
  if ((await rpc<string>("eth_chainId")) !== CHAIN_ID_HEX) await rpc("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }], 60_000);
  if ((await rpc<string>("eth_chainId")) !== CHAIN_ID_HEX) throw new Error("Wallet is not on Base");
}

async function balance(): Promise<bigint> {
  if (dir === "eth-usdc") return BigInt(await rpc<string>("eth_getBalance", [account, "latest"]));
  return read(ADDR.usdc, "balanceOf", [account]);
}

function parse(): bigint {
  try { return parseUnits(($("amt") as HTMLInputElement).value.trim() || "0", dec(dir)); } catch { return 0n; }
}

async function refresh() {
  amountIn = parse();
  quote = 0n;
  $("out").textContent = "-";
  $("symIn").textContent = sym(dir)[0];
  $("symOut").textContent = sym(dir)[1];
  if (account && ready) {
    $("bal").textContent = `(balance ${formatUnits(await balance(), dec(dir))})`;
    allowance = dir === "usdc-eth" ? await read(ADDR.usdc, "allowance", [account, ADDR.router]) : 0n;
  }
  if (account && ready && amountIn > 0n) {
    try {
      const res = decodeFunctionResult({ abi, functionName: "quoteExactInputSingle", data: await ethCall(ADDR.quoter, quoteCall(dir, amountIn)) });
      quote = res[0];
      $("out").textContent = formatUnits((quote * (10_000n - SLIPPAGE_BPS)) / 10_000n, dec(dir === "eth-usdc" ? "usdc-eth" : "eth-usdc"));
    } catch (e) { say("Quote failed: " + String((e as Error).message ?? e)); }
  }
  label();
}

function label() {
  const go = $("go") as HTMLButtonElement;
  go.disabled = busy;
  go.textContent = !account ? "Connect wallet" : dir === "usdc-eth" && amountIn > allowance ? "Approve USDC" : "Swap";
}

async function wait(hash: Hex) {
  for (let i = 0; i < 60; i++) {
    const r = await rpc<{ status: string } | null>("eth_getTransactionReceipt", [hash]);
    if (r) { if (r.status !== "0x1") throw new Error("Transaction reverted: " + hash); return; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for " + hash);
}
const send = async (to: Address, data: Hex, value = 0n) =>
  rpc<Hex>("eth_sendTransaction", [{ from: account, to, data, value: "0x" + value.toString(16) }], 180_000);

async function connect() {
  say("Waiting for the wallet popup…");
  const accs = await rpc<Address[]>("eth_requestAccounts", [], 60_000);
  account = getAddress(accs[0]);
  await ensureChain();
  const bad = await preflight();
  if (bad.length) { account = undefined; throw new Error("Safety check failed, swap disabled:\n- " + bad.join("\n- ")); }
  ready = true;
  say("Connected " + account);
}

async function act() {
  busy = true; label(); say("");
  try {
    if (!account) await connect();
    else {
      await ensureChain();
      amountIn = parse();
      if (amountIn <= 0n) throw new Error("Enter an amount");
      if (amountIn > (await balance())) throw new Error("Insufficient balance");
      if (dir === "usdc-eth" && amountIn > allowance) {
        say("Confirm the approval in your wallet…");
        await wait(await send(ADDR.usdc, encodeFunctionData({ abi, functionName: "approve", args: [ADDR.router, amountIn] }))); // exact amount, not infinite
      } else {
        const res = decodeFunctionResult({ abi, functionName: "quoteExactInputSingle", data: await ethCall(ADDR.quoter, quoteCall(dir, amountIn)) });
        const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECS);
        const { data, value } = swapCall(dir, account, amountIn, res[0], SLIPPAGE_BPS, deadline);
        say("Confirm the swap in your wallet…");
        const hash = await send(ADDR.router, data, value);
        say("Pending: " + hash);
        await wait(hash);
        say("Swap confirmed: " + hash);
      }
    }
  } catch (e) { say(String((e as { message?: string }).message ?? e)); }
  busy = false;
  await refresh().catch(() => undefined);
}

let timer: number | undefined;
$("amt").addEventListener("input", () => { label(); clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 400); });
$("flip").addEventListener("click", () => { dir = dir === "eth-usdc" ? "usdc-eth" : "eth-usdc"; ($("amt") as HTMLInputElement).value = ""; void refresh(); });
$("go").addEventListener("click", () => void act());
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
sel.addEventListener("change", () => { eth = wallets[sel.selectedIndex].provider; account = undefined; ready = false; say(""); void refresh(); });
addEventListener("eip6963:announceProvider", (e) => {
  const d = (e as CustomEvent<{ info: { name: string }; provider: Eip1193 }>).detail;
  if (!wallets.some((w) => w.name === d.info.name)) { wallets.push({ name: d.info.name, provider: d.provider }); fill(); }
});
dispatchEvent(new Event("eip6963:requestProvider"));
fill();
