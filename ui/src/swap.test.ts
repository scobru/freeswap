import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionData } from "viem";
import { CHAINS } from "./config.ts";
import { refuse } from "./guard.ts";
import { abi, encodePath, minOut, routes, swapCall } from "./swap.ts";

assert.equal(minOut(1_000_000n, 50n), 995_000n);
assert.equal(minOut(1n, 50n), 0n); // rounds down, never above the quote

const [base, mainnet] = CHAINS;
const [eth, usdc, dai] = base.tokens;
assert.equal(encodePath([eth.address, usdc.address], [500]).toLowerCase(), (eth.address + "0001f4" + usdc.address.slice(2)).toLowerCase());
assert.equal(routes(base, eth, usdc).length, 4); // WETH pair: direct fee tiers only
assert.equal(routes(base, usdc, dai).length, 8); // plus four paths through WETH

const user = "0x1111111111111111111111111111111111111111";
const path = encodePath([eth.address, usdc.address], [500]);
const sell = swapCall(eth, usdc, path, user, 10n ** 18n, 2_000_000_000n, 50n, 99n);
assert.equal(sell.value, 10n ** 18n);
const back = encodePath([usdc.address, eth.address], [500]);
const buy = swapCall(usdc, eth, back, user, 5_000_000n, 10n ** 15n, 50n, 99n);
assert.equal(buy.value, 0n);
const outer = decodeFunctionData({ abi, data: buy.data });
assert.equal(outer.functionName, "multicall");
const [deadline, inner] = outer.args as [bigint, `0x${string}`[]];
assert.equal(deadline, 99n);
assert.deepEqual(decodeFunctionData({ abi, data: inner[1] }).args, [minOut(10n ** 15n, 50n), user]);

// The bridge relays FreeSwap's own transactions and nothing that could pay someone else
const tx = (to: string, data: `0x${string}`, value = 0n, from = user) => [{ from, to, data, value: "0x" + value.toString(16) }];
const thief = "0x2222222222222222222222222222222222222222";
assert.equal(refuse("eth_sendTransaction", tx(base.router, sell.data, sell.value), user), undefined);
assert.equal(refuse("eth_sendTransaction", tx(base.router, buy.data), user), undefined);
assert.equal(refuse("eth_sendTransaction", tx(mainnet.router, sell.data, sell.value), user), undefined);
assert.equal(refuse("eth_sendTransaction", tx(usdc.address, encodeFunctionData({ abi, functionName: "approve", args: [base.router, 5n] })), user), undefined);
assert.ok(refuse("eth_sendTransaction", tx(base.router, swapCall(eth, usdc, path, thief, 1n, 1n, 50n, 99n).data, 1n), user)); // output to someone else
assert.ok(refuse("eth_sendTransaction", tx(base.router, swapCall(usdc, eth, back, thief, 1n, 1n, 50n, 99n).data), user));
// Output parked in the router but never unwrapped to the sender (a later sweep could take it)
const parked = encodeFunctionData({ abi, functionName: "multicall", args: [99n, [encodeFunctionData({ abi, functionName: "exactInput", args: [{ path, recipient: "0x0000000000000000000000000000000000000002", amountIn: 1n, amountOutMinimum: 0n }] })]] });
assert.ok(refuse("eth_sendTransaction", tx(base.router, parked, 1n), user));
// Parked USDC with a decoy unwrap: the parked token is not WETH
const decoy = encodeFunctionData({ abi, functionName: "multicall", args: [99n, [decodeFunctionData({ abi, data: parked }).args[1]![0] as `0x${string}`, inner[1]]] });
assert.ok(refuse("eth_sendTransaction", tx(base.router, decoy, 1n), user));
assert.ok(refuse("eth_sendTransaction", tx(usdc.address, encodeFunctionData({ abi, functionName: "approve", args: [thief, 5n] })), user));
assert.ok(refuse("eth_sendTransaction", tx(thief, "0x", 1n), user)); // plain transfer
assert.ok(refuse("eth_sendTransaction", tx(base.router, sell.data, sell.value, thief), user)); // not the connected account
assert.ok(refuse("eth_sendTransaction", tx(base.router, sell.data, sell.value), undefined)); // nothing connected yet
assert.ok(refuse("personal_sign", ["0x", user], user));
assert.ok(refuse("wallet_switchEthereumChain", [{ chainId: "0xa" }], user));
assert.equal(refuse("wallet_switchEthereumChain", [{ chainId: "0x1" }], user), undefined);
assert.equal(refuse("eth_call", [{}], user), undefined);
console.log("ok");
