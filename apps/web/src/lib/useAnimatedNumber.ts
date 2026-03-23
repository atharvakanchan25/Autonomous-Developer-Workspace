"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates a number from its previous value to a new target.
 * Duration ~400ms, linear interpolation — readable and calm.
 */
export function useAnimatedNumber(target: number, durationMs = 400): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;

    if (from === to) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, durationMs]);

  return display;
}
