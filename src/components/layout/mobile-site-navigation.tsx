/**
 * Renders the mobile site navigation interface and its user interactions.
 */

"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { HeaderNavigationLink } from "@/config/header-navigation.config";

export function MobileSiteNavigation({
  primaryLinks,
  utilityLinks
}: {
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
        className="grid h-11 w-11 place-items-center rounded-full text-black hover:bg-white/10 hover:text-red"
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
            <div className="grid gap-1 pt-2">
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
