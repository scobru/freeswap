import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { ADDR, FEE } from "./config.ts";

export const abi = parseAbi([
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) returns (uint256)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
]);

// SwapRouter02 sentinel: pay out to the router itself so unwrapWETH9 can turn WETH into ETH.
const ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

export const minOut = (quote: bigint, bps: bigint) => (quote * (10_000n - bps)) / 10_000n;

export type Dir = "eth-usdc" | "usdc-eth";
const tokens = (d: Dir) => (d === "eth-usdc" ? [ADDR.weth, ADDR.usdc] as const : [ADDR.usdc, ADDR.weth] as const);

export function quoteCall(d: Dir, amountIn: bigint): Hex {
  const [tokenIn, tokenOut] = tokens(d);
  return encodeFunctionData({ abi, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn, fee: FEE, sqrtPriceLimitX96: 0n }] });
}

/** Router calldata plus the ETH value to send. `to` is always ADDR.router. */
export function swapCall(d: Dir, user: Address, amountIn: bigint, quote: bigint, bps: bigint, deadline: bigint) {
  const [tokenIn, tokenOut] = tokens(d);
  const out = minOut(quote, bps);
  const swap = (recipient: Address) => encodeFunctionData({
    abi, functionName: "exactInputSingle",
    args: [{ tokenIn, tokenOut, fee: FEE, recipient, amountIn, amountOutMinimum: d === "eth-usdc" ? out : 0n, sqrtPriceLimitX96: 0n }],
  });
  // usdc-eth: swap into the router, then unwrap with the real minimum, so the whole tx reverts below slippage.
  const calls = d === "eth-usdc" ? [swap(user)] : [swap(ADDRESS_THIS), encodeFunctionData({ abi, functionName: "unwrapWETH9", args: [out, user] })];
  return { data: encodeFunctionData({ abi, functionName: "multicall", args: [deadline, calls] }), value: d === "eth-usdc" ? amountIn : 0n };
}
