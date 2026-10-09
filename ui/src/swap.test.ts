import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { abi, minOut, swapCall } from "./swap.ts";
import { refuse } from "./guard.ts";
import { ADDR } from "./config.ts";
import { encodeFunctionData } from "viem";

assert.equal(minOut(1_000_000n, 50n), 995_000n);
assert.equal(minOut(1n, 50n), 0n); // rounds down, never above the quote

const user = "0x1111111111111111111111111111111111111111";
const sell = swapCall("eth-usdc", user, 10n ** 18n, 2_000_000_000n, 50n, 99n);
assert.equal(sell.value, 10n ** 18n);
const buy = swapCall("usdc-eth", user, 5_000_000n, 10n ** 15n, 50n, 99n);
assert.equal(buy.value, 0n);

const outer = decodeFunctionData({ abi, data: buy.data });
assert.equal(outer.functionName, "multicall");
const [deadline, inner] = outer.args as [bigint, `0x${string}`[]];
assert.equal(deadline, 99n);
assert.equal(inner.length, 2);
const unwrap = decodeFunctionData({ abi, data: inner[1] });
assert.deepEqual(unwrap.args, [minOut(10n ** 15n, 50n), user]);

// The bridge relays FreeSwap's own transactions and nothing that could pay someone else
const tx = (to: string, data: `0x${string}`, value = 0n, from = user) => [{ from, to, data, value: "0x" + value.toString(16) }];
assert.equal(refuse("eth_sendTransaction", tx(ADDR.router, sell.data, sell.value), user), undefined);
assert.equal(refuse("eth_sendTransaction", tx(ADDR.router, buy.data), user), undefined);
assert.equal(refuse("eth_sendTransaction", tx(ADDR.usdc, encodeFunctionData({ abi, functionName: "approve", args: [ADDR.router, 5n] })), user), undefined);
const thief = "0x2222222222222222222222222222222222222222";
assert.ok(refuse("eth_sendTransaction", tx(ADDR.router, swapCall("eth-usdc", thief, 1n, 1n, 50n, 99n).data, 1n), user)); // output to someone else
assert.ok(refuse("eth_sendTransaction", tx(ADDR.router, swapCall("usdc-eth", thief, 1n, 1n, 50n, 99n).data), user));
assert.ok(refuse("eth_sendTransaction", tx(ADDR.usdc, encodeFunctionData({ abi, functionName: "approve", args: [thief, 5n] })), user));
assert.ok(refuse("eth_sendTransaction", tx(thief, "0x", 1n), user)); // plain transfer
assert.ok(refuse("eth_sendTransaction", tx(ADDR.router, sell.data, sell.value, thief), user)); // not the connected account
assert.ok(refuse("eth_sendTransaction", tx(ADDR.router, sell.data, sell.value), undefined)); // nothing connected yet
assert.ok(refuse("personal_sign", ["0x", user], user));
assert.ok(refuse("wallet_switchEthereumChain", [{ chainId: "0x1" }], user));
assert.equal(refuse("wallet_switchEthereumChain", [{ chainId: "0x2105" }], user), undefined);
assert.equal(refuse("eth_call", [{}], user), undefined);
console.log("ok");
