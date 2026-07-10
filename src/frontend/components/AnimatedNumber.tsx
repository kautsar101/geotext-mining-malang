"use client";

import { useEffect, useRef, useState } from "react";

const MAX_STEPS = 60;

type AnimatedNumberProps = {
  value: number;
  suffix?: string;
  prefix?: string;
  className?: string;
};

/**
 * Hook: count from 0 → value in fixed-step intervals.
 * Each frame increments by max(1, floor(value / MAX_STEPS)) so every
 * number ticks at the same cadence regardless of magnitude.
 */
export function useCountUp(value: number, isVisible: boolean): number {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const target = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    if (target === 0) { setDisplay(0); return; }

    const stepSize = Math.max(1, Math.floor(target / MAX_STEPS));
    let current = 0;
    let frameId = 0;

    const animate = () => {
      current = Math.min(current + stepSize, target);
      setDisplay(current);
      if (current < target) frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isVisible, value]);

  return display;
}

export default function AnimatedNumber({ value, suffix = "", prefix = "", className }: AnimatedNumberProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const displayValue = useCountUp(value, isVisible);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isVisible) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { threshold: 0.2 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  return <span ref={elementRef} className={className}>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
}
