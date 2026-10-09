export {};
// Probe: can a page served by Freenet (sandboxed iframe) use a wallet and an external RPC?
// If any check fails, a swap UI hosted on Freenet needs a workaround.
const RPC = "https://mainnet.base.org";

type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown> };
const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;

const rows: [string, string][] = [];
const out = document.getElementById("app")!;
function render() {
  out.innerHTML = "<h1>FreeSwap probe</h1><pre>" +
    rows.map(([k, v]) => `${k.padEnd(22)} ${v}`).join("\n") + "</pre>";
}
async function check(name: string, f: () => Promise<string>) {
  rows.push([name, "..."]);
  const i = rows.length - 1;
  render();
  try { rows[i][1] = "OK   " + (await f()); } catch (e) { rows[i][1] = "FAIL " + String(e); }
  render();
}

await check("framed", async () => String(window.top !== window));
await check("origin", async () => location.origin);
await check("localStorage", async () => { localStorage.setItem("p", "1"); return "writable"; });
await check("window.ethereum", async () => { if (!eth) throw "not injected"; return "present"; });
await check("fetch RPC", async () => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  return JSON.stringify(await r.json());
});
await check("wallet accounts", async () => {
  if (!eth) throw "no wallet";
  return JSON.stringify(await eth.request({ method: "eth_requestAccounts" }));
});
