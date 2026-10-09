import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { abi, minOut, swapCall } from "./swap.ts";

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
console.log("ok");
