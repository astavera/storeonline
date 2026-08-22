"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminCustomerPrivacyProfile } from "@/server/admin/admin-customer-privacy-service";

export function AdminCustomerPrivacyPanel({ canNote, canPrivacy, profile }: { canNote: boolean; canPrivacy: boolean; profile: AdminCustomerPrivacyProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function mutate(body: Record<string, unknown>, success: string) {
    setBusy(String(body.action)); setMessage("");
    try {
      const response = await fetch("/api/admin/customers/privacy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Customer privacy action failed.");
      setMessage(success); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Customer privacy action failed."); } finally { setBusy(""); }
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form).get("body");
    void mutate({ action: "add_note", customerId: profile.id, body }, "Support note added.").then(() => form.reset());
  }

  return (
    <section className="admin-panel mt-4 p-5" aria-labelledby="customer-privacy-profile-heading">
      <div className="admin-panel-header"><div><h2 className="admin-section-heading" id="customer-privacy-profile-heading">{profile.displayName}</h2><p className="admin-section-note">{profile.email} · internal notes and privacy-request workflow</p></div><Link className="admin-button-secondary" href="/admin/customers">Close</Link></div>
      {message ? <p className="mt-4 rounded-md border border-border bg-surface-muted p-3 text-sm" role="status">{message}</p> : null}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold">Support notes</h3>
          {canNote ? <form className="mt-3 grid gap-3" onSubmit={addNote}><textarea className="admin-form-control min-h-24" maxLength={2_000} name="body" placeholder="Add operational context; never enter payment data or secrets." required /><button className="admin-button w-fit" disabled={busy === "add_note"} type="submit">Add note</button></form> : null}
          <ol className="mt-4 grid gap-3">{profile.notes.map((note) => <li className="rounded-md border border-border bg-surface-muted p-3 text-sm" key={note.id}><p className="whitespace-pre-wrap">{note.body}</p><p className="mt-2 text-xs text-secondary">{note.author} · {formatDate(note.createdAt)}</p></li>)}{profile.notes.length === 0 ? <li className="text-sm text-secondary">No support notes.</li> : null}</ol>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold">Privacy requests</h3>{canPrivacy ? <div className="flex flex-wrap gap-2"><a className="admin-button-secondary" href={`/api/admin/customers/privacy?mode=export&customerId=${encodeURIComponent(profile.id)}`}>Export local data</a><button className="admin-button-secondary" disabled={busy === "request_deletion"} onClick={() => { if (window.confirm("Create a deletion review request? This does not automatically delete Store Admin, Square, or Operations records.")) void mutate({ action: "request_deletion", customerId: profile.id }, "Deletion review request created."); }} type="button">Request deletion review</button></div> : null}</div>
          <p className="mt-2 text-xs leading-5 text-secondary">Deletion is never automatic. Legal retention and records in Square or Operations must be reviewed by an authorized owner.</p>
          <ol className="mt-4 grid gap-3">{profile.privacyRequests.map((request) => <li className="rounded-md border border-border p-3" key={request.id}><div className="flex justify-between gap-3"><div><strong className="text-sm">{request.requestType.replaceAll("_", " ")}</strong><p className="mt-1 text-xs text-secondary">Opened {formatDate(request.createdAt)}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{request.status.replaceAll("_", " ")}</span></div>{request.resolutionNote ? <p className="mt-3 text-xs text-secondary">{request.resolutionNote}</p> : null}{canPrivacy && (request.status === "REQUESTED" || request.status === "IN_REVIEW") ? <RequestResolutionForm busy={busy} onSubmit={(status, resolutionNote) => mutate({ action: "update_request", requestId: request.id, status, resolutionNote }, "Privacy request updated.")} /> : null}</li>)}{profile.privacyRequests.length === 0 ? <li className="text-sm text-secondary">No privacy requests.</li> : null}</ol>
        </div>
      </div>
    </section>
  );
}

function RequestResolutionForm({ busy, onSubmit }: { busy: string; onSubmit: (status: "IN_REVIEW" | "COMPLETED" | "REJECTED", resolutionNote: string) => Promise<void> }) {
  return <form className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit(data.get("status") as "IN_REVIEW" | "COMPLETED" | "REJECTED", String(data.get("resolutionNote") || "")); }}><select className="admin-form-control" defaultValue="IN_REVIEW" name="status"><option value="IN_REVIEW">In review</option><option value="COMPLETED">Completed</option><option value="REJECTED">Rejected</option></select><input className="admin-form-control" maxLength={1_000} minLength={3} name="resolutionNote" placeholder="Required resolution note" required /><button className="admin-button-secondary" disabled={busy === "update_request"} type="submit">Update</button></form>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value)); }
