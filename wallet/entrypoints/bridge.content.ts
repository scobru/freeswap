import { freenetSite } from '@/lib/freenet'

// Isolated-world relay between the inpage provider and the background.
export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'], // no plain-http sites: see background.ts
  runAt: 'document_start',
  allFrames: true, // only for Freenet app frames: main() leaves every other frame alone
  main() {
    if (window !== window.top && !freenetSite(location.href)) return
    const post = (msg: object) => window.postMessage({ target: 'plainwallet-inpage', ...msg }, window === window.top ? location.origin : '*') // a sandboxed frame's origin is opaque; the target is this same window either way
    const rpc = (method: string, params?: unknown[]) =>
      browser.runtime
        .sendMessage({ method, params })
        .catch((e) => ({ error: { code: -32603, message: String(e?.message ?? e) } }))

    window.addEventListener('message', async ({ source, data }) => {
      if (source !== window || data?.target !== 'plainwallet-bridge') return
      post({ id: data.id, ...(await rpc(data.method, data.params)) })
    })

    // The background says *that* something changed; what this origin may see is still decided by the background.
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.chain) rpc('eth_chainId').then((r) => post({ event: 'chainChanged', data: r.result }))
      if (msg.accounts) rpc('eth_accounts').then((r) => post({ event: 'accountsChanged', data: r.result }))
    })
  },
})
