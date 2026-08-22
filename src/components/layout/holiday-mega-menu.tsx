/** Renders the full-width Holidays navigation menu. */

"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

const MAX_DROPDOWN_ROWS = 6;
const HOLIDAY_COLUMN_WIDTH = 128;

export type HolidayMenuItem = {
  slug: string;
  label: string;
};

export function HolidayMegaMenu({
  holidays,
  hoverClassName = "hover:text-yellow",
  link
}: {
  holidays: HolidayMenuItem[];
  hoverClassName?: string;
  link: HeaderNavigationLink;
}) {
  const [open, setOpen] = useState(false);
  const [menuCenter, setMenuCenter] = useState(0);
  const [menuTop, setMenuTop] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuWidth = Math.max(1, Math.ceil(holidays.length / MAX_DROPDOWN_ROWS)) * HOLIDAY_COLUMN_WIDTH;

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const header = rootRef.current?.closest("header");
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      setMenuTop(header?.getBoundingClientRect().bottom ?? 0);
      if (triggerBounds) {
        const pagePadding = 16;
        const visibleMenuWidth = Math.min(menuWidth, window.innerWidth - pagePadding * 2);
        const triggerCenter = triggerBounds.left + triggerBounds.width / 2;
        setMenuCenter(Math.min(window.innerWidth - visibleMenuWidth / 2 - pagePadding, Math.max(visibleMenuWidth / 2 + pagePadding, triggerCenter)));
      }
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuWidth, open]);

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
        className={`flex min-h-10 items-center gap-1 rounded-md px-1 font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${hoverClassName}`}
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
            <div
              className="grid max-w-[calc(100vw-2rem)] -translate-x-1/2 grid-flow-col overflow-x-auto overflow-y-hidden"
              data-dropdown-grid="holidays"
              data-max-rows={MAX_DROPDOWN_ROWS}
              style={{
                gridAutoColumns: `${HOLIDAY_COLUMN_WIDTH}px`,
                gridTemplateRows: `repeat(${MAX_DROPDOWN_ROWS}, auto)`,
                marginLeft: menuCenter,
                width: menuWidth
              }}
            >
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
