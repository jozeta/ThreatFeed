import { useLayoutEffect, useRef } from 'react';

const ACTIVE = '[aria-selected="true"], [aria-current="page"]';

/** The ink's transform for a tab at `left` (px within the strip) that is `width` wide */
export const inkTransform = (left: number, width: number) => `translateX(${left}px) scaleX(${width})`;

/**
 * The underline that slides to the active tab. Put `listRef` on the strip (position: relative, so the ink
 * scrolls with the tabs) and `inkRef` on a `.tab-ink` span inside it; the active tab is the one with
 * aria-selected or aria-current. The ink follows `activeKey`, and the strip's and tabs' size changes (a label
 * appearing on the active tab, a resize). It slides only after its first placement.
 */
export function useTabInk<L extends HTMLElement = HTMLDivElement>(activeKey: unknown) {
  const listRef = useRef<L>(null);
  const inkRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const ink = inkRef.current;
    if (!list || !ink) return;
    const place = () => {
      const tab = list.querySelector<HTMLElement>(ACTIVE);
      // Hidden (no active tab, or not laid out yet, e.g. jsdom or display: none)
      if (!tab || !tab.offsetWidth) { ink.setAttribute('data-hidden', ''); return; }
      ink.removeAttribute('data-hidden');
      ink.style.transform = inkTransform(tab.offsetLeft, tab.offsetWidth);
      if (!ink.hasAttribute('data-ready')) requestAnimationFrame(() => ink.setAttribute('data-ready', ''));
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(list);
    list.querySelectorAll(':scope > *').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeKey]);

  return { listRef, inkRef };
}
