# FreeSwap

Swap UI served from [Freenet](https://freenet.org); wallet and settlement on Base (Uniswap V3).

## How it works

Freenet serves the page in a sandboxed iframe: no `localStorage`, and `fetch` to external RPCs fails.
The wallet is reachable, so every read (quote, balance, allowance) and write goes through `window.ethereum`.

- ETH <-> USDC on Base, one pool (WETH/USDC 0.05%), 0.5% slippage, 10 minute deadline.
- Quote with QuoterV2, swap with SwapRouter02 `multicall(deadline, ...)`. USDC -> ETH unwraps with the real minimum, so the whole transaction reverts below slippage. Approvals are for the exact amount.
- MetaMask can't work here: it talks to its content script with `postMessage(…, location.origin)`, which the sandboxed frame's opaque origin never receives. Use the Plain Wallet fork in [`wallet/`](wallet/README.md), which supports Freenet app frames, and pick it in the Wallet selector.
- On connect the page checks the configured addresses onchain (code exists, `router.WETH9()`, `quoter.factory()`, pool exists, USDC symbol/decimals) and disables the swap if anything differs.

**The addresses in `ui/src/config.ts` are unverified candidates.** Confirm them on Basescan or the Uniswap docs before using real funds. This UI is not audited.

## Development

```bash
cd ui && npm install
npm test            # calldata / slippage self-check
npm run dev         # http://localhost:5173 (not sandboxed, so storage and fetch work; wallet needed)
npm run build       # then: fdev website publish dist --key freeswap
```

## Not done

Routing across fee tiers or tokens, token list, ENS, USD values, a Freenet-native orderbook.
