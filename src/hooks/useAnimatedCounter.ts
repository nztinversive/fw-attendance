'use client';

import { useEffect, useRef, useState } from 'react';

export function useAnimatedCounter(target: number, duration: number = 600): number {
  const [current, setCurrent] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + diff * eased);

      setCurrent(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevTarget.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}
