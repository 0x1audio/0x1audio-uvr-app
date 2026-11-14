import { flushSync } from "react-dom"

/*
  Run a state change as a view transition, so the old screen cross-fades into
  the new one. Falls back to a plain update where the browser can't, or when the
  person asked for less motion.
  From Mixel's design system (Apache-2.0), which doesn't export it from
  @ox1audio/design-system yet. When it does, this file goes.
*/
export function transition(update: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
  if (reduce || !start) {
    update()
    return
  }
  start.call(document, () => flushSync(update))
}
