import type { OverlayPanel } from 'primereact/overlaypanel'
import { type RefObject, useCallback, useEffect, useRef } from 'react'

/**
 * Spread the returned `{ onShow, onHide }` onto an OverlayPanel to make it
 * close when *any* scrollable ancestor scrolls. PrimeReact's OverlayPanel
 * appends to body, so when the trigger row scrolls inside a DataTable the
 * panel otherwise stays pinned to its old screen position. Listening on the
 * window in capture phase catches scrolls from every scrollable container
 * without having to know which one holds the trigger.
 */
export function useOverlayScrollDismiss(op: RefObject<OverlayPanel | null>) {
  const handler = useRef<(() => void) | null>(null)

  const onShow = useCallback(() => {
    const fn = () => op.current?.hide()
    handler.current = fn
    window.addEventListener('scroll', fn, true)
  }, [op])

  const onHide = useCallback(() => {
    if (handler.current) {
      window.removeEventListener('scroll', handler.current, true)
      handler.current = null
    }
  }, [])

  // Belt-and-braces cleanup: if the consumer unmounts while the panel is
  // still open (so `onHide` never fires), the listener would otherwise leak
  // and call hide() against a stale ref forever.
  useEffect(
    () => () => {
      if (handler.current) {
        window.removeEventListener('scroll', handler.current, true)
        handler.current = null
      }
    },
    []
  )

  return { onShow, onHide }
}
