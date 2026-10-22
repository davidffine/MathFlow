import { useLayoutEffect, useRef } from "react";

// Reserve the dock's measured border box, including wrapped actions and safe
// area padding. Keep its desired palette height separate to avoid resize loops.
export function useDockHeight(ready: boolean) {
  const appRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const app = appRef.current,
      dock = dockRef.current;
    if (!ready || !app || !dock) return;
    const measure = () =>
      app.style.setProperty(
        "--input-dock-height",
        `${Math.ceil(dock.getBoundingClientRect().height)}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      app.style.removeProperty("--input-dock-height");
    };
  }, [ready]);
  return { appRef, dockRef };
}
