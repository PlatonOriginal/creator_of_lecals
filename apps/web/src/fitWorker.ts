/// <reference lib="webworker" />
/**
 * Fits the mannequin off the main thread: on a phone the fit takes a few
 * seconds, and the page should stay alive meanwhile. The worker loads its
 * own copy of the body model (from the browser cache after the first time).
 */
import { type AnnyBody, type FitTarget, fitBody, loadAnnyBody } from '@lecals/body'

let body: Promise<AnnyBody> | undefined

self.onmessage = async (e: MessageEvent<{ id: number; baseUrl: string; target: FitTarget }>) => {
  const { id, baseUrl, target } = e.data
  try {
    body ??= loadAnnyBody(baseUrl)
    const result = fitBody(await body, target)
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message })
  }
}
