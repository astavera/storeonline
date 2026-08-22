/** Renders department category menus from the primary desktop navigation. */

"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

const MAX_DROPDOWN_ROWS = 6;
const MAIN_COLUMN_WIDTH = 224;
const SIMPLE_COLUMN_WIDTH = 192;
const GROUP_DIVIDER_WIDTH = 1;

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

export function DepartmentMegaMenu({
  hoverClassName = "hover:text-yellow",
  link,
  menu
}: {
  hoverClassName?: string;
  link: HeaderNavigationLink;
  menu: DepartmentMenuContent;
}) {
  const [open, setOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [menuLeft, setMenuLeft] = useState(0);
  const [menuTop, setMenuTop] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const grouped = Boolean(menu.groups?.length);
  const mainEntryCount = (menu.items?.length ?? 0) + (menu.groups?.length ?? 0) + 1;
  const mainColumnCount = Math.max(1, Math.ceil(mainEntryCount / MAX_DROPDOWN_ROWS));
  const submenuColumnCount = grouped
    ? Math.max(1, ...(menu.groups ?? []).map((group) =>
        Math.ceil((group.items.length + (group.href ? 1 : 0)) / MAX_DROPDOWN_ROWS)
      ))
    : 0;
  const preferredMenuWidth = grouped
    ? (mainColumnCount * MAIN_COLUMN_WIDTH) + (submenuColumnCount * SIMPLE_COLUMN_WIDTH) + 12 + GROUP_DIVIDER_WIDTH
    : mainColumnCount * SIMPLE_COLUMN_WIDTH;

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const header = rootRef.current?.closest("header");
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      setMenuTop(header?.getBoundingClientRect().bottom ?? 0);

      if (triggerBounds) {
        const pagePadding = 16;
        const menuWidth = Math.min(preferredMenuWidth, window.innerWidth - pagePadding * 2);
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
  }, [open, preferredMenuWidth]);

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
          aria-label={menu.ariaLabel}
          className="fixed inset-x-0 z-50 border-t border-slate-100 bg-white text-black shadow-[0_16px_32px_rgba(15,23,42,0.14)]"
          id={menuId}
          role="group"
          style={{ top: menuTop }}
        >
          <div className="py-2">
            <div
              className="max-w-[calc(100vw-2rem)] overflow-x-auto overflow-y-hidden"
              style={{ marginLeft: menuLeft, width: preferredMenuWidth }}
            >
              {grouped ? (
                <div className="flex w-max min-w-full">
                  <div
                    className="grid shrink-0 grid-flow-col border-r border-slate-200 py-1"
                    data-dropdown-grid="main"
                    data-max-rows={MAX_DROPDOWN_ROWS}
                    style={{
                      gridAutoColumns: `${MAIN_COLUMN_WIDTH}px`,
                      gridTemplateRows: `repeat(${MAX_DROPDOWN_ROWS}, auto)`
                    }}
                  >
                    {menu.items?.map((item) => (
                      <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-bold text-primary transition hover:bg-slate-50 hover:text-blue" href={item.href} key={item.href} onClick={() => setOpen(false)}>
                        {item.label}
                      </Link>
                    ))}
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
                    <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.shopAllHref} onClick={() => setOpen(false)}>
                      {menu.shopAllLabel}
                    </Link>
                  </div>

                  {activeGroupIndex !== null && menu.groups?.[activeGroupIndex] ? (
                    <section className="min-w-0 flex-1 py-1 pl-3" aria-label={`${menu.groups[activeGroupIndex].label} categories`}>
                      <div
                        className="grid w-max grid-flow-col"
                        data-dropdown-grid="submenu"
                        data-max-rows={MAX_DROPDOWN_ROWS}
                        style={{
                          gridAutoColumns: `${SIMPLE_COLUMN_WIDTH}px`,
                          gridTemplateRows: `repeat(${MAX_DROPDOWN_ROWS}, auto)`
                        }}
                      >
                        {menu.groups[activeGroupIndex].items.map((item) => (
                          <Link className="flex min-h-8 items-center px-3 py-1 text-sm font-semibold text-primary transition hover:bg-slate-50 hover:text-blue" href={item.href} key={item.href} onClick={() => setOpen(false)}>
                            {item.label}
                          </Link>
                        ))}
                        {menu.groups[activeGroupIndex].href ? (
                          <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.groups[activeGroupIndex].href} onClick={() => setOpen(false)}>
                            Shop All {menu.groups[activeGroupIndex].label}
                          </Link>
                        ) : null}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : (
                <div
                  className="grid grid-flow-col"
                  data-dropdown-grid="main"
                  data-max-rows={MAX_DROPDOWN_ROWS}
                  style={{
                    gridAutoColumns: `${SIMPLE_COLUMN_WIDTH}px`,
                    gridTemplateRows: `repeat(${MAX_DROPDOWN_ROWS}, auto)`
                  }}
                >
                  {menu.items?.map((item) => (
                    <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-bold text-primary transition hover:bg-slate-50 hover:text-blue" href={item.href} key={item.href} onClick={() => setOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                  <Link className="flex min-h-9 items-center px-3 py-1.5 text-sm font-black text-blue transition hover:bg-slate-50 hover:text-navy" href={menu.shopAllHref} onClick={() => setOpen(false)}>
                    {menu.shopAllLabel}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
