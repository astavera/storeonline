"use client";

import { useMemo, useState, type FormEvent } from "react";

type Workspace = { providerReady: boolean; provider: string; definitions: ReadonlyArray<{ key: string; name: string; variables: readonly string[] }>; templates: Array<{ templateKey: string; subject: string; bodyText: string; status: string; version: number }>; deliveries: Array<{ id: string; eventType: string; status: string; createdAt: string }> };

export function AdminNotificationsManager({ canTest, initial }: { canTest: boolean; initial: Workspace }) {
  const [workspace, setWorkspace] = useState(initial);
  const [selectedKey, setSelectedKey] = useState(initial.definitions[0]?.key ?? "ORDER_CONFIRMATION");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const definition = workspace.definitions.find((item) => item.key === selectedKey)!;
  const template = useMemo(() => workspace.templates.find((item) => item.templateKey === selectedKey), [selectedKey, workspace.templates]);

  async function mutate(formElement: HTMLFormElement, action: "save_draft" | "publish" | "test_send") {
    setBusy(true); setMessage("");
    const form = new FormData(formElement);
    const body = action === "test_send" ? { action, key: selectedKey, email: form.get("email") } : { action, key: selectedKey, subject: form.get("subject"), bodyText: form.get("bodyText") };
    try {
      const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Notification action failed.");
      const refreshed = await fetch("/api/admin/notifications", { cache: "no-store" }).then((item) => item.json()) as Workspace;
      setWorkspace(refreshed); setMessage(action === "test_send" ? "Test message sent and recorded." : action === "publish" ? "Template version published." : "Draft version saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Notification action failed."); } finally { setBusy(false); }
  }

  return <main className="grid gap-6 p-5 sm:p-7"><section className="rounded-xl border border-border bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Transactional messaging</p><h2 className="mt-2 text-2xl font-semibold">Notifications</h2><p className="mt-2 text-sm text-secondary">Versioned templates for operational messages. Full marketing automation remains out of scope.</p><span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${workspace.providerReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{workspace.providerReady ? `${workspace.provider} ready` : "Provider not selected"}</span></section><section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]"><aside className="rounded-xl border border-border bg-white p-3 shadow-sm">{workspace.definitions.map((item) => <button className={`block w-full rounded-md px-3 py-2 text-left text-sm ${item.key === selectedKey ? "bg-primary text-white" : "hover:bg-surface-muted"}`} key={item.key} onClick={() => setSelectedKey(item.key)} type="button">{item.name}</button>)}</aside><div className="grid gap-5"><form className="grid gap-4 rounded-xl border border-border bg-white p-5 shadow-sm" key={`${selectedKey}-${template?.version ?? 0}`} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void mutate(event.currentTarget, "save_draft"); }}><div className="flex justify-between"><h3 className="font-semibold">{definition.name}</h3><span className="text-xs text-secondary">{template ? `${template.status.toLowerCase()} · v${template.version}` : "Not configured"}</span></div><label className="grid gap-2 text-sm font-semibold">Subject<input className="admin-form-control" defaultValue={template?.subject ?? ""} maxLength={180} name="subject" required /></label><label className="grid gap-2 text-sm font-semibold">Plain-text body<textarea className="admin-form-control min-h-48" defaultValue={template?.bodyText ?? ""} maxLength={10_000} name="bodyText" required /></label><p className="text-xs text-secondary">Allowed variables: {definition.variables.map((value) => `{{${value}}}`).join(", ")}</p><div className="flex gap-2"><button className="rounded border border-border px-4 py-2 text-sm font-semibold" disabled={busy} type="submit">Save draft</button><button className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white" disabled={busy} onClick={(event) => { const form = event.currentTarget.form; if (form) void mutate(form, "publish"); }} type="button">Publish</button></div></form>{canTest ? <form className="flex gap-3 rounded-xl border border-border bg-white p-5 shadow-sm" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void mutate(event.currentTarget, "test_send"); }}><input className="admin-form-control flex-1" name="email" placeholder="Test recipient email" required type="email" /><button className="rounded border border-border px-4 text-sm font-semibold" disabled={busy || !workspace.providerReady} type="submit">Send test</button></form> : null}{message ? <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm" role="status">{message}</p> : null}</div></section></main>;
}
