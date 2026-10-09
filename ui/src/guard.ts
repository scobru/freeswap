import { decodeFunctionData, getAddress, type Hex } from "viem";
import { CHAINS } from "./config.ts";
import { abi, ADDRESS_THIS } from "./swap.ts";

// The bridge lends its origin's wallet connection to whatever window opened it, so it only relays what FreeSwap
// itself needs: reads, the supported chains, and transactions that can only swap or approve the router for the sender.
const READS = new Set(["eth_chainId", "eth_accounts", "eth_requestAccounts", "eth_call", "eth_getBalance", "eth_getCode", "eth_getTransactionReceipt", "eth_blockNumber", "eth_estimateGas"]);
const ROUTERS = new Set(CHAINS.map((c) => getAddress(c.router)));
const TOKENS = new Set(CHAINS.flatMap((c) => c.tokens.filter((t) => !t.native).map((t) => getAddress(t.address))));

/** Why the bridge refuses this request, or undefined if it may go to the wallet. */
export function refuse(method: string, params: unknown[] = [], account?: string): string | undefined {
  if (READS.has(method)) return;
  if (method === "wallet_switchEthereumChain") return CHAINS.some((c) => c.id === (params[0] as { chainId?: string })?.chainId) ? undefined : "Only Base and Ethereum";
  if (method !== "eth_sendTransaction") return `${method} is not allowed`;
  const tx = params[0] as { from?: string; to?: string; data?: Hex; value?: string };
  try {
    const from = getAddress(tx.from!);
    if (!account || from !== getAddress(account)) return "Sender is not the connected account";
    const to = getAddress(tx.to!);
    if (TOKENS.has(to)) {
      const c = decodeFunctionData({ abi, data: tx.data! });
      if (BigInt(tx.value ?? 0) || c.functionName !== "approve" || !ROUTERS.has(getAddress(c.args[0]))) return "Only a token approval for the router";
      return;
    }
    if (!ROUTERS.has(to)) return "Only the Uniswap router and listed tokens";
    const outer = decodeFunctionData({ abi, data: tx.data! });
    if (outer.functionName !== "multicall") return "Only router multicall";
    const calls = outer.args[1].map((data) => decodeFunctionData({ abi, data }));
    const unwraps = calls.some((c) => c.functionName === "unwrapWETH9" && getAddress(c.args[1]) === from);
    const weth = getAddress(CHAINS.find((c) => getAddress(c.router) === to)!.weth);
    for (const c of calls) {
      if (c.functionName === "unwrapWETH9") { if (getAddress(c.args[1]) !== from) return "Swap output must go to the sender"; continue; }
      if (c.functionName !== "exactInput") return `Router call ${c.functionName} is not allowed`;
      const recipient = getAddress(c.args[0].recipient);
      // Output left in the router is only safe when it is WETH that this same multicall unwraps to the sender.
      const toRouter = recipient === ADDRESS_THIS && unwraps && getAddress(`0x${c.args[0].path.slice(-40)}`) === weth;
      if (recipient !== from && !toRouter) return "Swap output must go to the sender";
    }
  } catch {
    return "Unrecognized transaction";
  }
}
