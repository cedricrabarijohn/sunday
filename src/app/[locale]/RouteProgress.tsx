"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./RouteProgress.module.scss";

/**
 * A thin top progress bar that gives immediate feedback during App Router
 * navigations. It starts the instant a same-origin link is clicked — so even
 * on a slow connection, before the next segment (or its loading.tsx) streams
 * in, the user sees that something is happening — and completes once the
 * route actually changes.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  const stopTrickle = () => {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
  };

  const start = () => {
    if (active.current) return;
    active.current = true;
    if (fade.current) {
      clearTimeout(fade.current);
      fade.current = null;
    }
    setFinishing(false);
    setVisible(true);
    setWidth(8);
    stopTrickle();
    // Ease toward 90% and wait there until the route resolves.
    trickle.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w));
    }, 240);
  };

  const done = () => {
    if (!active.current) return;
    active.current = false;
    stopTrickle();
    setWidth(100);
    setFinishing(true);
    fade.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
      setFinishing(false);
    }, 320);
  };

  // The route committed — finish the bar.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Start on same-origin link clicks that change the path.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same path (e.g. ?card= toggles, in-page anchors) isn't a route change.
      if (url.pathname === window.location.pathname) return;
      start();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Failsafe: never leave the bar hanging if a navigation is aborted.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(done, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(
    () => () => {
      stopTrickle();
      if (fade.current) clearTimeout(fade.current);
    },
    [],
  );

  if (!visible) return null;
  return (
    <div
      className={styles.bar}
      style={{ width: `${width}%`, opacity: finishing ? 0 : 1 }}
      aria-hidden
    />
  );
}
