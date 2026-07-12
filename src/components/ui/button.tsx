/*
STORE AREA: UI primitives
SECTION: Button Primitive
SECTION ID: shared.ui.button
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Token-based button styling used by storefront, checkout, and admin surfaces.
SAFE TO EDIT: Visual variants that map to design tokens.
DO NOT EDIT HERE: Checkout submission logic, Square token handling, or RBAC checks.
RELATED FILES: src/design/presets/button-presets.ts
BUSINESS LOGIC FILES: none
*/

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { buttonPresets, type ButtonPresetId } from "@/design/presets/button-presets";
import { cn } from "@/lib/utils";

const baseClass = "inline-flex min-h-11 items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold transition focus-visible:shadow-[var(--shadow-focus)]";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonPresetId;
};

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonPresetId;
  children: ReactNode;
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return <button className={cn(baseClass, buttonPresets[variant], className)} {...props} />;
}

export function ButtonLink({ className, variant = "primary", href, ...props }: ButtonLinkProps) {
  return <Link className={cn(baseClass, buttonPresets[variant], className)} href={href} {...props} />;
}
