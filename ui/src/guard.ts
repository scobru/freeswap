import { decodeFunctionData, getAddress, type Hex } from "viem";
import { ADDR, CHAIN_ID_HEX } from "./config.ts";
import { abi, ADDRESS_THIS } from "./swap.ts";

// The bridge lends its origin's MetaMask connection to whatever window opened it, so it only relays what FreeSwap
// itself needs: reads, Base, and transactions that can only swap or approve the router for the sender.
const READS = new Set(["eth_chainId", "eth_accounts", "eth_requestAccounts", "eth_call", "eth_getBalance", "eth_getCode", "eth_getTransactionReceipt", "eth_blockNumber", "eth_estimateGas"]);

/** Why the bridge refuses this request, or undefined if it may go to the wallet. */
export function refuse(method: string, params: unknown[] = [], account?: string): string | undefined {
  if (READS.has(method)) return;
  if (method === "wallet_switchEthereumChain") return (params[0] as { chainId?: string })?.chainId === CHAIN_ID_HEX ? undefined : "Only Base";
  if (method !== "eth_sendTransaction") return `${method} is not allowed`;
  const tx = params[0] as { from?: string; to?: string; data?: Hex; value?: string };
  try {
    const from = getAddress(tx.from!);
    if (!account || from !== getAddress(account)) return "Sender is not the connected account";
    const to = getAddress(tx.to!);
    if (to === getAddress(ADDR.usdc)) {
      const c = decodeFunctionData({ abi, data: tx.data! });
      if (BigInt(tx.value ?? 0) || c.functionName !== "approve" || getAddress(c.args[0]) !== getAddress(ADDR.router)) return "Only a USDC approval for the router";
      return;
    }
    if (to !== getAddress(ADDR.router)) return "Only the Uniswap router and USDC";
    const outer = decodeFunctionData({ abi, data: tx.data! });
    if (outer.functionName !== "multicall") return "Only router multicall";
    for (const data of outer.args[1]) {
      const c = decodeFunctionData({ abi, data });
      const recipient = c.functionName === "exactInputSingle" ? c.args[0].recipient : c.functionName === "unwrapWETH9" ? c.args[1] : undefined;
      if (!recipient) return `Router call ${c.functionName} is not allowed`;
      if (getAddress(recipient) !== from && getAddress(recipient) !== ADDRESS_THIS) return "Swap output must go to the sender";
    }
  } catch {
    return "Unrecognized transaction";
  }
}
