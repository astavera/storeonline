/** Renders the full-width Holidays navigation menu. */

"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

export type HolidayMenuItem = {
  slug: string;
  label: string;
};

export function HolidayMegaMenu({ link, holidays }: { link: HeaderNavigationLink; holidays: HolidayMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [menuCenter, setMenuCenter] = useState(0);
  const [menuTop, setMenuTop] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const header = rootRef.current?.closest("header");
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      setMenuTop(header?.getBoundingClientRect().bottom ?? 0);
      if (triggerBounds) {
        const menuWidth = 128;
        const pagePadding = 16;
        const triggerCenter = triggerBounds.left + triggerBounds.width / 2;
        setMenuCenter(Math.min(window.innerWidth - menuWidth / 2 - pagePadding, Math.max(menuWidth / 2 + pagePadding, triggerCenter)));
      }
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div
      className="relative flex items-center"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="flex min-h-10 items-center gap-1 rounded-md px-1 font-bold transition hover:text-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        data-header-nav-id={link.id}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{link.label}</span>
        <ChevronDown aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} size={16} strokeWidth={2.5} />
      </button>

      {open ? (
        <div
          aria-label="Holiday collections"
          className="fixed inset-x-0 z-50 border-t border-slate-100 bg-white text-black shadow-[0_16px_32px_rgba(15,23,42,0.14)]"
          id={menuId}
          role="group"
          style={{ top: menuTop }}
        >
          <div className="py-1.5">
            <div className="w-max min-w-32 -translate-x-1/2 overflow-hidden" style={{ marginLeft: menuCenter }}>
              {holidays.map((holiday) => (
                <Link className="flex min-h-9 w-full items-center px-3 py-1.5 text-left text-sm font-bold text-primary transition hover:bg-slate-50 hover:text-blue" href={`/holidays/${holiday.slug}`} key={holiday.slug} onClick={() => setOpen(false)}>
                  {holiday.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
