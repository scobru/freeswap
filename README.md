# FreeSwap

Swap UI served from [Freenet](https://freenet.org); wallet and settlement on Base (Uniswap V3).

## How it works

Freenet serves the page in a sandboxed iframe: no `localStorage`, and `fetch` to external RPCs fails.
So every read (quote, balance, allowance) and write goes through the wallet.

- ETH <-> USDC on Base, one pool (WETH/USDC 0.05%), 0.5% slippage, 10 minute deadline.
- Quote with QuoterV2, swap with SwapRouter02 `multicall(deadline, ...)`. USDC -> ETH unwraps with the real minimum, so the whole transaction reverts below slippage. Approvals are for the exact amount.
- Wallet extensions can't answer inside the sandbox: they talk to their content script with `postMessage(…, location.origin)`, which a frame with an opaque origin never receives. So by default ("Wallet in popup") the page opens `bridge.html` from GitHub Pages in a popup, where the wallet works, and relays each request to it. The bridge only passes on reads, a switch to Base, USDC approvals for the router, and router swaps that pay out to the sender; it refuses anything else (`ui/src/guard.ts`), because it lends its origin's wallet connection to whichever window opened it. Keep the popup open while swapping.
- On connect the page checks the configured addresses onchain (code exists, `router.WETH9()`, `quoter.factory()`, pool exists, USDC symbol/decimals) and disables the swap if anything differs.

**The addresses in `ui/src/config.ts` are unverified candidates.** Confirm them on Basescan or the Uniswap docs before using real funds. This UI is not audited.

## Development

```bash
cd ui && npm install
npm test            # calldata / slippage self-check
npm run dev         # http://localhost:5173 (not sandboxed, so storage and fetch work; wallet needed)
npm run build       # then: fdev website publish dist --key freeswap
```

The bridge is published from `main` by `.github/workflows/pages.yml` (Settings -> Pages -> Source: GitHub Actions) to the URL in `BRIDGE_URL` (`ui/src/config.ts`).

## Not done

Routing across fee tiers or tokens, token list, ENS, USD values, a Freenet-native orderbook.
