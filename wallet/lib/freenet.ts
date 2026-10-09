/** Freenet serves each app in a sandboxed frame (opaque origin "null", shared by every app) from the local node at
 * /v1/contract/web/<contract key>/, so the wallet tells apps apart by that URL prefix instead of by origin. */
export const freenetSite = (url: string | undefined) => url?.match(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/v1\/contract\/web\/[^/?#]+/)?.[0]
