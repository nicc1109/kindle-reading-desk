import { useEffect, useMemo, useRef, useState } from "react";

export function useVirtualWindow({ count, rowHeight, overscan = 5, fallbackHeight = 640 }: {
  count: number;
  rowHeight: number;
  overscan?: number;
  fallbackHeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(fallbackHeight);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setViewportHeight(element.clientHeight || fallbackHeight);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallbackHeight]);

  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    return { start, end: Math.min(count, start + visible) };
  }, [count, overscan, rowHeight, scrollTop, viewportHeight]);

  const scrollToIndex = (index: number) => {
    const element = containerRef.current;
    const top = index * rowHeight;
    const bottom = top + rowHeight;
    let next = scrollTop;
    if (top < scrollTop) next = top;
    else if (bottom > scrollTop + viewportHeight) next = bottom - viewportHeight;
    if (next !== scrollTop) {
      if (element) element.scrollTop = next;
      setScrollTop(next);
    }
  };

  return {
    containerRef,
    start: range.start,
    end: range.end,
    totalHeight: count * rowHeight,
    onScroll: () => setScrollTop(containerRef.current?.scrollTop || 0),
    scrollToIndex,
  };
}
