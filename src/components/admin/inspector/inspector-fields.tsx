/**
 * Provides reusable labeled controls shared by all CMS inspector panels.
 */

"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function InspectorField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InspectorInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="admin-form-control admin-form-control--compact min-h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" {...props} />;
}

export function InspectorTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="admin-form-control admin-form-control--compact min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" {...props} />;
}

export function InspectorSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="admin-form-control admin-form-control--compact admin-native-select min-h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" {...props} />;
}
