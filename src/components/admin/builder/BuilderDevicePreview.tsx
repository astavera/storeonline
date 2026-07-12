"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuilderDevice } from "./types";

const devices: Array<{ id: BuilderDevice; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone }
];

export function BuilderDevicePreview({ device, setDevice }: { device: BuilderDevice; setDevice: (device: BuilderDevice) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-muted p-1" role="group" aria-label="Preview device">
      {devices.map((option) => {
        const Icon = option.icon;

        return (
          <button
            aria-label={option.label}
            aria-pressed={device === option.id}
            className={cn("flex h-8 w-9 items-center justify-center rounded text-secondary transition hover:text-primary", device === option.id && "bg-surface text-primary shadow-sm")}
            key={option.id}
            onClick={() => setDevice(option.id)}
            title={option.label}
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
          </button>
        );
      })}
    </div>
  );
}

export function builderDeviceWidthClass(device: BuilderDevice) {
  if (device === "mobile") {
    return "max-w-[390px]";
  }

  if (device === "tablet") {
    return "max-w-[760px]";
  }

  return "max-w-full";
}
