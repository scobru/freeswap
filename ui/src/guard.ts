import { decodeFunctionData, getAddress, type Hex } from "viem";
import { CHAINS, FEES } from "./config.ts";
import { abi, ADDRESS_THIS } from "./swap.ts";

// The bridge lends its origin's wallet connection to whatever window opened it, so it only relays what FreeSwap
// itself needs: reads, the supported chains, and transactions that can only swap or approve the router for the sender.
const READS = new Set(["eth_chainId", "eth_accounts", "eth_requestAccounts", "eth_call", "eth_getBalance", "eth_getCode", "eth_getTransactionReceipt", "eth_blockNumber", "eth_estimateGas"]);

/** Why the bridge refuses this request, or undefined if it may go to the wallet. */
export function refuse(method: string, params: unknown[] = [], account?: string): string | undefined {
  if (READS.has(method)) return;
  if (method === "wallet_switchEthereumChain") return CHAINS.some((c) => c.id === (params[0] as { chainId?: string })?.chainId) ? undefined : "Only Base and Ethereum";
  if (method !== "eth_sendTransaction") return `${method} is not allowed`;
  const tx = params[0] as { from?: string; to?: string; data?: Hex; value?: string; chainId?: string };
  try {
    const from = getAddress(tx.from!);
    if (!account || from !== getAddress(account)) return "Sender is not the connected account";
    // The wallet rejects a chainId that isn't its current chain, so a chain switch mid-flow can't send to the wrong router.
    const chain = CHAINS.find((c) => c.id === tx.chainId?.toLowerCase());
    if (!chain) return "Transaction must name Base or Ethereum as chainId";
    const to = getAddress(tx.to!);
    const tokens = new Set(chain.tokens.map((t) => getAddress(t.address)));
    if (tokens.has(to)) {
      const c = decodeFunctionData({ abi, data: tx.data! });
      if (BigInt(tx.value ?? 0) || c.functionName !== "approve" || getAddress(c.args[0]) !== getAddress(chain.router)) return "Only a token approval for the router";
      return;
    }
    if (to !== getAddress(chain.router)) return "Only the Uniswap router and listed tokens";
    const outer = decodeFunctionData({ abi, data: tx.data! });
    if (outer.functionName !== "multicall") return "Only router multicall";
    const calls = outer.args[1].map((data) => decodeFunctionData({ abi, data }));
    const unwraps = calls.some((c) => c.functionName === "unwrapWETH9" && getAddress(c.args[1]) === from);
    const weth = getAddress(chain.weth);
    for (const c of calls) {
      if (c.functionName === "unwrapWETH9") {
        if (getAddress(c.args[1]) !== from) return "Swap output must go to the sender";
        if (!c.args[0]) return "Swap needs a minimum output";
        continue;
      }
      if (c.functionName !== "exactInput") return `Router call ${c.functionName} is not allowed`;
      const { path, recipient: r, amountOutMinimum } = c.args[0];
      // Path is token(20 bytes) fee(3 bytes) token…: only listed tokens and fee tiers, so no pool an attacker made with their own token.
      if (path.length < 88 || (path.length - 42) % 46) return "Malformed swap path";
      for (let i = 2; i < path.length; i += 46) if (!tokens.has(getAddress(`0x${path.slice(i, i + 40)}`))) return "Swap path has an unlisted token";
      for (let i = 42; i < path.length; i += 46) if (!FEES.includes(parseInt(path.slice(i, i + 6), 16))) return "Swap path has an unknown fee tier";
      const recipient = getAddress(r);
      // Output left in the router is only safe when it is WETH that this same multicall unwraps to the sender.
      const toRouter = recipient === ADDRESS_THIS && unwraps && getAddress(`0x${path.slice(-40)}`) === weth;
      if (recipient !== from && !toRouter) return "Swap output must go to the sender";
      if (recipient === from && !amountOutMinimum) return "Swap needs a minimum output";
    }
  } catch {
    return "Unrecognized transaction";
  }
}
