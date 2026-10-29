import { useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from './sound';

/**
 * FLIP animation for reordering lists: children with data-flip="<key>" glide
 * from their old position to the new one with a springy curve.
 */
export function useFlip<T extends HTMLElement>(deps: unknown) {
  const ref = useRef<T>(null);
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    const next = new Map<string, number>();
    for (const el of els) next.set(el.dataset.flip!, el.getBoundingClientRect().top);
    if (!prefersReducedMotion()) {
      for (const el of els) {
        const before = last.current.get(el.dataset.flip!);
        const after = next.get(el.dataset.flip!)!;
        if (before === undefined || Math.abs(before - after) < 1) continue;
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.34,1.4,.64,1)' });
      }
    }
    last.current = next;
  }, [deps]);
  return ref;
}
