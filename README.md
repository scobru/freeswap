# FreeSwap

Swap UI served from [Freenet](https://freenet.org); wallet and settlement on Ethereum and Base (Uniswap V3).

## How it works

Freenet serves the page in a sandboxed iframe: no `localStorage`, and `fetch` to external RPCs fails.
So every read (quote, balance, allowance) and write goes through the wallet.

- Ethereum (ETH, USDC, USDT, DAI, WBTC, LINK, UNI, AAVE, PEPE) and Base (ETH, USDC, DAI, cbBTC, cbETH). Contracts from the Uniswap deployment docs, tokens from Uniswap's default token list (`ui/src/config.ts`). 0.5% slippage, 10 minute deadline.
- Each quote tries the pair directly at every fee tier and through WETH, with QuoterV2 `quoteExactInput`, and keeps the best. Swaps go through SwapRouter02 `multicall(deadline, [exactInput, ...])`. ETH in is wrapped by the router; ETH out unwraps with the real minimum, so the whole transaction reverts below slippage. Approvals are for the exact amount (a leftover allowance is reset to 0 first, as USDT requires).
- Wallet extensions can't answer inside the sandbox: they talk to their content script with `postMessage(…, location.origin)`, which a frame with an opaque origin never receives. So by default ("Wallet in popup") the page opens `bridge.html` from GitHub Pages in a popup, where the wallet works, and relays each request to it. The bridge only passes on reads, a switch to Ethereum or Base, token approvals for the router, and router swaps that pay out to the sender; it refuses anything else (`ui/src/guard.ts`), because it lends its origin's wallet connection to whichever window opened it. Keep the popup open while swapping.
- On connect, and on each chain switch, the page checks the configured addresses onchain (code exists, `router.WETH9()`, `quoter.factory()`, every token's decimals) and disables the swap if anything differs.

This UI is not audited: use small amounts.

## Development

```bash
cd ui && npm install
npm test            # calldata / slippage self-check
npm run dev         # http://localhost:5173 (not sandboxed, so storage and fetch work; wallet needed)
npm run build       # then: fdev website publish dist --key freeswap
```

The bridge is published from `main` by `.github/workflows/pages.yml` (Settings -> Pages -> Source: GitHub Actions) to the URL in `BRIDGE_URL` (`ui/src/config.ts`).

## Not done

Routes longer than two pools, custom tokens, other chains, ENS, USD values, a Freenet-native orderbook.
