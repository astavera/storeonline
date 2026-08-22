"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminWebhookRetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  async function retry() {
    setState("working");
    const response = await fetch("/api/admin/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "requeue", id: eventId }) }).catch(() => null);
    if (!response?.ok) return setState("error");
    setState("idle");
    router.refresh();
  }
  return <button className="rounded border border-border px-2 py-1 text-xs font-semibold disabled:opacity-50" disabled={state === "working"} onClick={retry} type="button">{state === "working" ? "Requeueing…" : state === "error" ? "Retry failed" : "Requeue"}</button>;
}
