"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

export type ExpandableSearchBarProps = {
  expandDirection?: "left" | "right";
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
  buttonClassName?: string;
  formClassName?: string;
  defaultOpen?: boolean;
  inputId?: string;
  width?: number;
};

const COLLAPSED_SIZE = 40;

export default function ExpandableSearchBar({
  expandDirection = "right",
  placeholder = "Search...",
  onSearch,
  className,
  buttonClassName,
  formClassName,
  defaultOpen = false,
  inputId = "expandable-catalog-search",
  width = 280
}: ExpandableSearchBarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [value, setValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expandsLeft = expandDirection === "left";

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node) && open && value === "") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
        setValue("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();

    if (query) {
      onSearch?.(query);
    }
  }

  return (
    <div
      className={cn("relative inline-block shrink-0", className)}
      ref={containerRef}
      style={{ height: COLLAPSED_SIZE, width: COLLAPSED_SIZE }}
    >
      <button
        aria-expanded={open}
        aria-label={open ? "Close search" : "Open search"}
        className={cn(
          "absolute inset-0 z-20 flex items-center justify-center overflow-visible rounded-full border border-border bg-surface p-0 text-primary transition-colors hover:bg-surface-muted",
          buttonClassName,
          open && "border-border bg-surface text-primary shadow-card hover:bg-surface-muted"
        )}
        onClick={() => {
          setOpen((current) => !current);
          if (open) {
            setValue("");
          }
        }}
        type="button"
      >
        {open ? <X aria-hidden="true" className="h-[22px] w-[22px] shrink-0" strokeWidth={2} /> : <Search aria-hidden="true" className="h-[22px] w-[22px] shrink-0" strokeWidth={2} />}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.form
            animate={{ opacity: 1, width }}
            className={cn(
              "absolute top-0 flex h-10 items-center overflow-hidden rounded-full border border-border bg-surface text-primary shadow-card",
              expandsLeft ? "right-0 pr-10" : "left-0 pl-10",
              formClassName
            )}
            exit={{ opacity: 0, width: COLLAPSED_SIZE }}
            initial={{ opacity: 0.98, width: COLLAPSED_SIZE }}
            onSubmit={handleSubmit}
            role="search"
            transition={{ damping: 26, stiffness: 260, type: "spring" }}
          >
            <button
              aria-label="Search products"
              className={cn(
                "absolute top-0 z-10 grid h-10 w-10 place-items-center text-secondary transition-colors hover:text-primary",
                expandsLeft ? "left-0" : "right-0"
              )}
              type="submit"
            >
              <Search aria-hidden="true" size={18} />
            </button>
            <label className="sr-only" htmlFor={inputId}>
              Search products
            </label>
            <input
              autoComplete="off"
              className={cn(
                "min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none placeholder:text-text-muted focus-visible:!outline-none",
                expandsLeft ? "pl-10" : "pr-10"
              )}
              id={inputId}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              ref={inputRef}
              type="search"
              value={value}
            />
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
