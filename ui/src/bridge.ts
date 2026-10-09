import { refuse } from "./guard.ts";

// Runs on a normal https origin, opened as a popup by the Freenet frame (whose opaque origin MetaMask can't serve).
type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown> };
const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
const opener = window.opener as Window | null;
const status = (t: string) => (document.getElementById("status")!.textContent = t);
const log = (t: string) => document.getElementById("log")!.prepend(t + "\n");
let account: string | undefined;

if (!opener) status("Open this page from FreeSwap.");
else if (!eth) status("No wallet found in this browser.");
else {
  status("Connected to FreeSwap. Waiting for requests.");
  addEventListener("message", async (e) => {
    const { id, method, params } = (e.data ?? {}) as { id?: number; method?: string; params?: unknown[] };
    if (e.source !== opener || typeof id !== "number" || typeof method !== "string") return;
    const reply = (msg: object) => opener.postMessage({ freeswapBridge: id, ...msg }, "*"); // the opener's origin is opaque
    const no = refuse(method, params, account);
    if (no) { log(`refused ${method}: ${no}`); return reply({ error: { code: 4100, message: `Bridge refused: ${no}` } }); }
    try {
      const result = await eth.request({ method, params });
      if (method === "eth_requestAccounts" || method === "eth_accounts") account = (result as string[])[0];
      if (method === "eth_sendTransaction") log(`sent ${result}`);
      reply({ result });
    } catch (err) {
      const { code, message } = err as { code?: number; message?: string };
      reply({ error: { code, message: message ?? String(err) } });
    }
  });
  opener.postMessage({ freeswapBridge: "ready" }, "*");
}
addEventListener("beforeunload", () => opener?.postMessage({ freeswapBridge: "closed" }, "*"));
