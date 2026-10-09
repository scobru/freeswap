import { concat, encodeFunctionData, numberToHex, parseAbi, type Address, type Hex } from "viem";
import { FEES, type Chain, type Token } from "./config.ts";

export const abi = parseAbi([
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[],uint32[],uint256)",
  "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
]);

// SwapRouter02 sentinel: pay out to the router itself so unwrapWETH9 can turn WETH into ETH.
export const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

export const minOut = (quote: bigint, bps: bigint) => (quote * (10_000n - bps)) / 10_000n;

/** Uniswap V3 path: token, fee (3 bytes), token, fee, token… */
export const encodePath = (tokens: Address[], fees: number[]): Hex =>
  concat(tokens.flatMap((t, i) => (i < fees.length ? [t, numberToHex(fees[i], { size: 3 })] : [t])));

/** Every route worth quoting: the pair directly at each fee tier, and through WETH at the two common tiers. */
export function routes(chain: Chain, a: Token, b: Token): Hex[] {
  const direct = FEES.map((f) => encodePath([a.address, b.address], [f]));
  if (a.address === chain.weth || b.address === chain.weth) return direct;
  const hops = [500, 3000].flatMap((f1) => [500, 3000].map((f2) => encodePath([a.address, chain.weth, b.address], [f1, f2])));
  return [...direct, ...hops];
}

export const quoteCall = (path: Hex, amountIn: bigint): Hex => encodeFunctionData({ abi, functionName: "quoteExactInput", args: [path, amountIn] });

/** Router calldata plus the ETH value to send. ETH in is wrapped by the router; ETH out is unwrapped with the real minimum. */
export function swapCall(tokenIn: Token, tokenOut: Token, path: Hex, user: Address, amountIn: bigint, quote: bigint, bps: bigint, deadline: bigint) {
  const out = minOut(quote, bps);
  const swap = (recipient: Address, amountOutMinimum: bigint) =>
    encodeFunctionData({ abi, functionName: "exactInput", args: [{ path, recipient, amountIn, amountOutMinimum }] });
  // ETH out: swap into the router, then unwrap with the real minimum, so the whole tx reverts below slippage.
  const calls = tokenOut.native ? [swap(ADDRESS_THIS, 0n), encodeFunctionData({ abi, functionName: "unwrapWETH9", args: [out, user] })] : [swap(user, out)];
  return { data: encodeFunctionData({ abi, functionName: "multicall", args: [deadline, calls] }), value: tokenIn.native ? amountIn : 0n };
}
