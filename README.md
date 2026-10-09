# FreeSwap

Swap UI served from [Freenet](https://freenet.org); wallet and settlement on an EVM L2 (Uniswap / Aerodrome).

## Status

`ui/` is a probe: it checks whether a page served by Freenet (sandboxed iframe) can reach
`window.ethereum` and an external RPC. Everything else depends on that answer.

```bash
cd ui && npm install && npm run dev      # http://localhost:5173 (not sandboxed)
npm run build                            # then publish ui/dist like freepolls (fdev website publish)
```

Run the probe both in the dev server and from the published Freenet URL and compare the rows.
