"use client";

import type { ReactNode } from "react";
import { builderDeviceWidthClass } from "./BuilderDevicePreview";
import type { BuilderDevice } from "./types";
import { cn } from "@/lib/utils";

export function BuilderPreviewFrame({ children, device }: { children: ReactNode; device: BuilderDevice }) {
  return <div className={cn("mx-auto min-h-[640px] overflow-hidden rounded-[16px] border border-border bg-surface shadow-sm transition-all", builderDeviceWidthClass(device))}>{children}</div>;
}
