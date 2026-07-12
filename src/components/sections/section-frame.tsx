/*
STORE AREA: Shared storefront/admin foundation
SECTION: Section Frame
SECTION ID: varies by caller
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Standard section wrapper, data-store attributes, spacing, and optional image background.
SAFE TO EDIT: Layout classes, semantic wrapper behavior, and visual token usage.
DO NOT EDIT HERE: Business rules, Square data access, checkout validation, delivery fees, or slot capacity.
RELATED FILES: src/config/store-section-registry.ts, src/design/presets/section-layout-presets.ts
BUSINESS LOGIC FILES: none
*/

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionFrameProps = {
  sectionId: string;
  area: string;
  component: string;
  variant?: string;
  className?: string;
  backgroundImage?: string;
  children: ReactNode;
};

export function SectionFrame({
  sectionId,
  area,
  component,
  variant,
  className,
  backgroundImage,
  children
}: SectionFrameProps) {
  const style = backgroundImage
    ? ({
        backgroundImage: `linear-gradient(90deg, rgba(31, 41, 51, 0.72), rgba(31, 41, 51, 0.28)), url(${backgroundImage})`
      } satisfies CSSProperties)
    : undefined;

  return (
    <section
      className={cn("w-full", className)}
      data-store-area={area}
      data-store-component={component}
      data-store-section={sectionId}
      data-store-variant={variant}
      style={style}
    >
      {children}
    </section>
  );
}
