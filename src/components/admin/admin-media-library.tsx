"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type MediaAsset = { id: string; source: string; sourceId: string | null; url: string; altTextEn: string | null; mimeType: string | null; width: number | null; height: number | null; hiddenFromWebsite: boolean; createdAt: string };

export function AdminMediaLibrary({ assets, canWrite }: { assets: MediaAsset[]; canWrite: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("upload"); setMessage("");
    try {
      const response = await fetch("/api/admin/media", { method: "POST", body: new FormData(event.currentTarget) });
      const result = await response.json() as { ok?: boolean; errors?: string[]; indexed?: boolean };
      if (!response.ok || !result.ok) throw new Error(result.errors?.[0] || "Upload failed.");
      event.currentTarget.reset();
      setMessage(result.indexed ? "Image uploaded and indexed." : "Image uploaded, but the media index is unavailable.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); } finally { setBusyId(""); }
  }

  async function save(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/media", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, altTextEn: form.get("altTextEn"), hiddenFromWebsite: form.get("hiddenFromWebsite") === "on" }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Media metadata could not be saved.");
      setMessage("Media metadata saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Media metadata could not be saved."); } finally { setBusyId(""); }
  }

  return (
    <div className="grid gap-5">
      {canWrite ? <form className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm sm:flex-row sm:items-end" onSubmit={upload}><label className="grid flex-1 gap-2 text-sm font-semibold">Upload storefront image<input accept="image/jpeg,image/png,image/webp,image/gif" className="admin-form-control" name="file" required type="file" /></label><button className="min-h-10 rounded-md bg-primary px-5 text-sm font-semibold text-white" disabled={busyId === "upload"} type="submit">{busyId === "upload" ? "Uploading…" : "Upload"}</button></form> : null}
      {message ? <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm" role="status">{message}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => <form className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm" key={asset.id} onSubmit={(event) => save(event, asset.id)}><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><a className="block truncate font-semibold underline underline-offset-4" href={asset.url} rel="noreferrer" target="_blank">{asset.sourceId || asset.id}</a><span className="text-xs text-secondary">{asset.mimeType || "Unknown type"} · {asset.source}</span></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${asset.hiddenFromWebsite ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{asset.hiddenFromWebsite ? "Hidden" : "Visible"}</span></div><label className="grid gap-2 text-xs font-semibold">English alt text<textarea className="admin-form-control min-h-20 text-sm" defaultValue={asset.altTextEn ?? ""} disabled={!canWrite} maxLength={300} name="altTextEn" /></label><label className="flex items-center gap-2 text-sm"><input defaultChecked={asset.hiddenFromWebsite} disabled={!canWrite} name="hiddenFromWebsite" type="checkbox" /> Hide from website</label>{canWrite ? <button className="min-h-9 rounded-md border border-border px-3 text-sm font-semibold" disabled={busyId === asset.id} type="submit">{busyId === asset.id ? "Saving…" : "Save metadata"}</button> : null}</form>)}
      </div>
    </div>
  );
}
