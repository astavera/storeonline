/**
 * Renders the three commercial shortcuts directly beneath a department hero.
 */

"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type DepartmentPromoAction = {
  href: string;
  label: string;
  tone: "blue" | "gold" | "red";
};

const toneClasses: Record<DepartmentPromoAction["tone"], string> = {
  blue: "bg-blue text-white hover:bg-navy",
  gold: "bg-[#f7bb5e] text-navy hover:bg-yellow",
  red: "bg-[#c72d43] text-white hover:bg-red"
};

export function DepartmentPromoActions({ actions, label, variant = "full-bleed" }: { actions: DepartmentPromoAction[]; label: string; variant?: "contained" | "full-bleed" }) {
  const navRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setRevealed(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setRevealed(true);
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label={label} className={variant === "contained" ? "department-commerce-shell grid grid-cols-2 gap-2 pb-8 md:grid-cols-3 lg:pb-10" : "grid grid-cols-2 overflow-hidden md:grid-cols-3"} ref={navRef}>
      {actions.slice(0, 3).map((action, index) => (
        <Link
          className={`flex items-center justify-between gap-4 font-display font-black uppercase tracking-[-0.02em] transition-[background-color,border-color,color,opacity,transform] duration-500 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-4 motion-reduce:transform-none motion-reduce:transition-none ${index === 0 ? "col-span-2 md:col-span-1" : ""} ${variant === "contained" ? "min-h-[54px] rounded-md border border-border bg-surface px-4 py-3 text-xs text-primary shadow-sm hover:border-blue hover:bg-cyan focus-visible:outline-blue sm:min-h-[60px] sm:px-5 sm:text-sm" : `min-h-[64px] px-5 py-4 text-sm focus-visible:outline-inset focus-visible:outline-white sm:min-h-[76px] sm:px-7 sm:text-lg ${toneClasses[action.tone]}`} ${revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
          href={action.href}
          key={`${action.label}-${action.href}`}
          style={{ transitionDelay: revealed ? `${index * 70}ms` : "0ms" }}
        >
          <span>{action.label}</span>
          <ArrowRight aria-hidden="true" className={`shrink-0 ${variant === "contained" ? "text-blue" : ""}`} size={20} strokeWidth={2.5} />
        </Link>
      ))}
    </nav>
  );
}
