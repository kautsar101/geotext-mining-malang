"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type ViewportChartProps = {
  children: (isVisible: boolean) => ReactNode;
  className?: string;
};

export default function ViewportChart({ children, className }: ViewportChartProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || isVisible) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsVisible(true);
      observer.disconnect();
    }, { threshold: 0.15 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  return <div ref={elementRef} className={className}>{children(isVisible)}</div>;
}
