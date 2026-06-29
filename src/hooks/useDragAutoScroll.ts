import { useEffect, useRef } from "react";

/**
 * Auto-scroll while a native HTML5 drag is in progress.
 *
 * The browser does not scroll a container when a dragged element is held near
 * its edge, so off-screen piles (horizontal) or cards far down a long pile
 * (vertical) are unreachable. While `active` is true this scrolls whichever
 * scrollable ancestor sits under the pointer once it enters an edge zone, with
 * speed ramping up the closer the pointer gets to the edge.
 *
 * Two non-obvious things this has to work around:
 *
 *  - rAF starvation: while a native drag runs, Chromium spins a nested message
 *    loop that starves requestAnimationFrame but still services timers — so the
 *    loop is driven by setInterval, plus a synchronous scroll on every
 *    `dragover` so motion scrolls immediately.
 *  - scroll-snap: the pile scroller uses `scroll-snap-type: x`, which re-snaps
 *    every small programmatic scrollLeft change back to the nearest pile (i.e.
 *    back to 0), so incremental auto-scroll moves nothing. We temporarily
 *    disable snapping on any element we scroll and restore it when the drag ends.
 *
 * It is fully decoupled from the drag handlers: it only reads pointer position
 * and mutates scroll offsets, touching no React state.
 */
export function useDragAutoScroll(active: boolean) {
  const point = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) return;

    const EDGE = 72; // px: size of the hot zone at each edge
    const MAX_SPEED = 20; // px per tick at the very edge

    // 0 outside the zone, ramping up to MAX_SPEED at (and past) the edge.
    const speed = (distance: number) =>
      distance >= EDGE ? 0 : Math.ceil(((EDGE - distance) / EDGE) * MAX_SPEED);

    const scrollable = (el: Element, axis: "x" | "y") => {
      const style = getComputedStyle(el);
      return axis === "x"
        ? /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth
        : /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
    };

    // Suppress scroll-snap on every element we drive, remembering the original
    // inline value so the cleanup can put it back exactly as it was.
    const snapOff = new Map<HTMLElement, string>();
    const disableSnap = (el: Element) => {
      if (!(el instanceof HTMLElement) || snapOff.has(el)) return;
      snapOff.set(el, el.style.scrollSnapType);
      el.style.scrollSnapType = "none";
    };

    const step = () => {
      const p = point.current;
      if (!p) return;

      // Top-most elements first; scroll the nearest scrollable one on each axis.
      const stack = document.elementsFromPoint(p.x, p.y);
      let didX = false;
      let didY = false;

      for (const el of stack) {
        if (didX && didY) break;
        const r = el.getBoundingClientRect();

        if (!didX && scrollable(el, "x")) {
          const fromLeft = p.x - r.left;
          const fromRight = r.right - p.x;
          if (fromLeft < EDGE && el.scrollLeft > 0) {
            disableSnap(el);
            el.scrollLeft -= speed(fromLeft);
            didX = true;
          } else if (
            fromRight < EDGE &&
            el.scrollLeft + el.clientWidth < el.scrollWidth
          ) {
            disableSnap(el);
            el.scrollLeft += speed(fromRight);
            didX = true;
          }
        }

        if (!didY && scrollable(el, "y")) {
          const fromTop = p.y - r.top;
          const fromBottom = r.bottom - p.y;
          if (fromTop < EDGE && el.scrollTop > 0) {
            disableSnap(el);
            el.scrollTop -= speed(fromTop);
            didY = true;
          } else if (
            fromBottom < EDGE &&
            el.scrollTop + el.clientHeight < el.scrollHeight
          ) {
            disableSnap(el);
            el.scrollTop += speed(fromBottom);
            didY = true;
          }
        }
      }
    };

    const onDragOver = (e: DragEvent) => {
      point.current = { x: e.clientX, y: e.clientY };
      step(); // scroll immediately while the pointer is moving
    };

    window.addEventListener("dragover", onDragOver, true);
    const timer = window.setInterval(step, 1000 / 60);

    return () => {
      window.removeEventListener("dragover", onDragOver, true);
      window.clearInterval(timer);
      for (const [el, prev] of snapOff) el.style.scrollSnapType = prev;
      snapOff.clear();
      point.current = null;
    };
  }, [active]);
}
