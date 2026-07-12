"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

export function MobileSiteNavigation({
  mobileCta,
  primaryLinks,
  utilityLinks
}: {
  mobileCta: HeaderNavigationLink;
  primaryLinks: HeaderNavigationLink[];
  utilityLinks: HeaderNavigationLink[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const header = root.closest("header");

    if (!header) {
      return;
    }

    const navigationRoot: HTMLDivElement = root;
    const siteHeader: Element = header;

    function updateHeaderOffset() {
      navigationRoot.style.setProperty("--mobile-nav-top", `${siteHeader.getBoundingClientRect().height}px`);
    }

    updateHeaderOffset();

    if (typeof ResizeObserver === "undefined") {
      return () => navigationRoot.style.removeProperty("--mobile-nav-top");
    }

    const resizeObserver = new ResizeObserver(updateHeaderOffset);
    resizeObserver.observe(siteHeader);

    return () => {
      resizeObserver.disconnect();
      navigationRoot.style.removeProperty("--mobile-nav-top");
    };
  }, []);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 1280px)");

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsOpen(false);
      }
    }

    desktopMediaQuery.addEventListener("change", handleDesktopChange);

    return () => desktopMediaQuery.removeEventListener("change", handleDesktopChange);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? []
        ).filter(
          (element) => element.getClientRects().length > 0 && !element.inert
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements.at(-1);

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    const previousBodyOverflow = document.body.style.overflow;
    const inertedElements: HTMLElement[] = [];
    let currentElement: HTMLElement | null = rootRef.current;

    while (currentElement && currentElement !== document.body) {
      const parentElement = currentElement.parentElement;

      if (!parentElement) {
        break;
      }

      Array.from(parentElement.children).forEach((sibling) => {
        if (sibling !== currentElement && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          inertedElements.push(sibling);
        }
      });
      currentElement = parentElement;
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      inertedElements.forEach((element) => {
        element.inert = false;
      });
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div
      aria-label={isOpen ? "Mobile navigation" : undefined}
      aria-modal={isOpen ? true : undefined}
      className="relative [--mobile-nav-top:106px] sm:[--mobile-nav-top:114px] xl:hidden"
      ref={rootRef}
      role={isOpen ? "dialog" : undefined}
    >
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10 hover:text-yellow"
        data-mobile-nav-trigger
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        {isOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
      </button>
      {isOpen ? (
        <>
          <button
            aria-label="Close mobile navigation backdrop"
            className="fixed inset-x-0 bottom-0 top-[var(--mobile-nav-top)] z-40 cursor-default bg-primary/35 backdrop-blur-[1px]"
            onClick={() => {
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
            tabIndex={-1}
            type="button"
          />
          <nav
            aria-label="Mobile navigation"
            className="fixed bottom-0 left-0 top-[var(--mobile-nav-top)] z-50 w-[min(22rem,88vw)] overflow-y-auto border-r border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-primary shadow-card"
            data-mobile-nav-panel
            id={menuId}
          >
            <div className="border-b border-border px-2 pb-4 pt-1">
              <form action="/search" className="flex min-h-12 items-center gap-2 rounded-md border border-border bg-surface-muted px-3 focus-within:border-blue" role="search">
                <Search aria-hidden="true" className="shrink-0 text-blue" size={20} />
                <label className="sr-only" htmlFor={`${menuId}-search`}>
                  Search products
                </label>
                <input className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold outline-none placeholder:text-text-muted" id={`${menuId}-search`} name="q" placeholder="Search products" type="search" />
                <button className="shrink-0 rounded-pill bg-blue px-3 py-2 text-sm font-black text-white hover:bg-primary" type="submit">
                  Search
                </button>
              </form>
              {mobileCta.visible ? (
                <Link className="mt-3 flex min-h-11 items-center justify-center rounded-pill bg-yellow px-4 py-2 text-sm font-black text-blue hover:bg-cyan" data-header-nav-id={mobileCta.id} href={mobileCta.href} onClick={() => setIsOpen(false)}>
                  {mobileCta.label}
                </Link>
              ) : null}
            </div>
            <div className="mt-3 grid gap-1">
              <Link className="rounded-md px-4 py-3 text-base font-black hover:bg-surface-muted hover:text-blue" href="/" onClick={() => setIsOpen(false)}>
                Home
              </Link>
              {primaryLinks.map((link) => (
                <Link className="rounded-md px-4 py-3 text-base font-black hover:bg-surface-muted hover:text-blue" data-header-nav-id={link.id} href={link.href} key={link.id} onClick={() => setIsOpen(false)}>
                  {link.label}
                </Link>
              ))}
            </div>
            {utilityLinks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {utilityLinks.map((link) => (
                  <Link className="rounded-pill bg-surface-muted px-3 py-2 text-sm font-bold hover:bg-cyan" data-header-nav-id={link.id} href={link.href} key={link.id} onClick={() => setIsOpen(false)}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </nav>
        </>
      ) : null}
    </div>
  );
}
