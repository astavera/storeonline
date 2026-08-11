/**
 * Reveals an About story row once it enters the shopper's viewport.
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type AboutBusinessStoryRevealProps = {
  children: ReactNode;
  direction: "left" | "right";
};

export function AboutBusinessStoryReveal({
  children,
  direction
}: AboutBusinessStoryRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setIsVisible(true);
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.14
      }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "transition-[opacity,transform,filter] duration-700 ease-out will-change-[opacity,transform,filter] motion-reduce:transform-none motion-reduce:transition-none",
        isVisible
          ? "translate-x-0 translate-y-0 opacity-100 blur-0"
          : "translate-y-8 opacity-0 blur-[2px]",
        !isVisible &&
          direction === "left" &&
          "lg:-translate-x-10 lg:translate-y-0",
        !isVisible &&
          direction === "right" &&
          "lg:translate-x-10 lg:translate-y-0"
      )}
      ref={containerRef}
    >
      {children}
    </div>
  );
}
