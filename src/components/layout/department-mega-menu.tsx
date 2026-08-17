/** Renders department category menus from the primary desktop navigation. */

"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

export type DepartmentMenuItem = {
  href: string;
  label: string;
};

export type DepartmentMenuGroup = {
  href?: string;
  items: DepartmentMenuItem[];
  label: string;
};

export type DepartmentMenuContent = {
  ariaLabel: string;
  groups?: DepartmentMenuGroup[];
  items?: DepartmentMenuItem[];
  shopAllHref: string;
  shopAllLabel: string;
};

export function DepartmentMegaMenu({ link, menu }: { link: HeaderNavigationLink; menu: DepartmentMenuContent }) {
  const [open, setOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [menuLeft, setMenuLeft] = useState(0);
  const [menuTop, setMenuTop] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const grouped = Boolean(menu.groups?.length);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const header = rootRef.current?.closest("header");
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      setMenuTop(header?.getBoundingClientRect().bottom ?? 0);

      if (triggerBounds) {
        const pagePadding = 16;
        const menuWidth = grouped ? Math.min(544, window.innerWidth - pagePadding * 2) : 192;
        const alignedLeft = triggerBounds.left - 8;
        setMenuLeft(Math.min(window.innerWidth - menuWidth - pagePadding, Math.max(pagePadding, alignedLeft)));
      }
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [grouped, open]);

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
          aria-label={menu.ariaLabel}
          className="fixed inset-x-0 z-50 border-t border-slate-100 bg-white text-black shadow-[0_16px_32px_rgba(15,23,42,0.14)]"
          id={menuId}
          role="group"
          style={{ top: menuTop }}
        >
          <div className="py-2">
            <div
              className={grouped ? "flex w-[min(34rem,calc(100vw-2rem))]" : "w-48 overflow-hidden"}
              style={{ marginLeft: menuLeft }}
            >
              {grouped ? (
                <>
                  <div className="w-56 shrink-0 border-r border-slate-200 py-1">
                    <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.shopAllHref} onClick={() => setOpen(false)}>
                      {menu.shopAllLabel}
                    </Link>
                    {menu.groups?.map((group, index) => {
                      const active = activeGroupIndex === index;

                      return (
                        <button
                          aria-expanded={active}
                          className={`flex min-h-9 w-full items-center justify-between px-3 py-1.5 text-left text-sm font-bold transition hover:bg-slate-50 hover:text-blue ${active ? "bg-slate-50 text-blue" : "text-primary"}`}
                          key={group.label}
                          onClick={() => setActiveGroupIndex(index)}
                          onFocus={() => setActiveGroupIndex(index)}
                          onMouseEnter={() => setActiveGroupIndex(index)}
                          type="button"
                        >
                          <span>{group.label}</span>
                          <ChevronRight aria-hidden="true" size={16} strokeWidth={2.5} />
                        </button>
                      );
                    })}
                  </div>

                  {activeGroupIndex !== null && menu.groups?.[activeGroupIndex] ? (
                    <section className="min-w-0 flex-1 py-1 pl-3" aria-label={`${menu.groups[activeGroupIndex].label} categories`}>
                      {menu.groups[activeGroupIndex].href ? (
                        <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.groups[activeGroupIndex].href} onClick={() => setOpen(false)}>
                          Shop All {menu.groups[activeGroupIndex].label}
                        </Link>
                      ) : null}
                      {menu.groups[activeGroupIndex].items.map((item) => (
                        <Link className="flex min-h-8 items-center px-3 py-1 text-sm font-semibold text-primary transition hover:bg-slate-50 hover:text-blue" href={item.href} key={item.href} onClick={() => setOpen(false)}>
                          {item.label}
                        </Link>
                      ))}
                    </section>
                  ) : null}
                </>
              ) : (
                <>
                  <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.shopAllHref} onClick={() => setOpen(false)}>
                    {menu.shopAllLabel}
                  </Link>
                  {menu.items?.map((item) => (
                    <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-bold text-primary transition hover:bg-slate-50 hover:text-blue" href={item.href} key={item.href} onClick={() => setOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
