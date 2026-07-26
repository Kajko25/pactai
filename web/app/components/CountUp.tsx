"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a stat up when it first scrolls into view.
 *
 * These are small numbers on a testnet, and animating them is a claim about
 * attention, not about scale — the point is that they came from somewhere and
 * change, unlike the fixed figures on most project pages. Under reduced motion
 * the final value renders immediately.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  durationMs = 900,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setShown(value);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    const start = performance.now();

    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / durationMs);
      // ease-out: fast first, settles onto the real number
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, value, durationMs]);

  return (
    <span ref={ref} className="tabular-nums">
      {shown.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
