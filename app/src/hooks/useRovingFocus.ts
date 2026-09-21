import { useRef } from "react";
import type { KeyboardEvent, RefCallback } from "react";

export type RovingOrientation = "horizontal" | "vertical";

export function nextRovingIndex(key: string, current: number, count: number, orientation: RovingOrientation): number | null {
  if (!count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  if (key === previous) return (current - 1 + count) % count;
  if (key === next) return (current + 1) % count;
  return null;
}

export function useRovingFocus<T extends HTMLElement>({
  count,
  activeIndex,
  labels,
  orientation,
  onActivate,
}: {
  count: number;
  activeIndex: number;
  labels?: string[];
  orientation: RovingOrientation;
  onActivate: (index: number) => void;
}) {
  const elements = useRef<Array<T | null>>([]);
  const typeahead = useRef({ value: "", at: 0 });

  const activate = (index: number) => {
    onActivate(index);
    setTimeout(() => elements.current[index]?.focus(), 0);
  };

  const itemProps = (index: number): {
    ref: RefCallback<T>;
    tabIndex: number;
    onKeyDown: (event: KeyboardEvent<T>) => void;
  } => ({
    ref: (element) => { elements.current[index] = element; },
    tabIndex: index === activeIndex || (activeIndex < 0 && index === 0) ? 0 : -1,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      const next = nextRovingIndex(event.key, index, count, orientation);
      if (next !== null) {
        event.preventDefault();
        activate(next);
        return;
      }
      if (!labels || event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1 || event.key === " ") return;
      const now = Date.now();
      const value = `${now - typeahead.current.at > 650 ? "" : typeahead.current.value}${event.key}`.toLocaleLowerCase();
      typeahead.current = { value, at: now };
      for (let offset = 1; offset <= count; offset += 1) {
        const candidate = (index + offset) % count;
        if (labels[candidate]?.toLocaleLowerCase().startsWith(value)) {
          event.preventDefault();
          activate(candidate);
          break;
        }
      }
    },
  });

  return { itemProps };
}
