/**
 * Renders the brand GTIN importer interface and its user interactions.
 */

"use client";

import { useState, type ChangeEvent } from "react";
import { Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import type { WebsiteBrand } from "@/features/catalog/services/website-merchandising-service";
import { parseCsvTable } from "@/features/catalog/services/merchandising-spreadsheet-service";

type BrandGtinPreview = {
  ok: boolean;
  error?: string;
  nonEmptyInputCount: number;
  uniqueGtinCount: number;
  duplicateInputCount: number;
  invalidInputs: string[];
  invalidInputCount: number;
  matchedGtinCount: number;
  matchedVariationCount: number;
  unmatchedGtins: string[];
  unmatchedGtinCount: number;
  duplicateCatalogGtins: string[];
  sampleMatches: Array<{
    gtin: string;
    itemName: string;
    variationId: string;
    variationName: string;
  }>;
};

type BrandGtinMutationResponse = BrandGtinPreview & {
  assignedVariationCount: number;
  variationIds: string[];
};

export type BrandGtinMutation = {
  action: "assign" | "remove";
  assignedVariationCount: number;
  variationIds: string[];
};

export function BrandGtinImporter({ brand, disabled, onApplied }: {
  brand: WebsiteBrand;
  disabled: boolean;
  onApplied: (mutation: BrandGtinMutation) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [gtins, setGtins] = useState<string[]>([]);
  const [preview, setPreview] = useState<BrandGtinPreview | null>(null);
  const [operation, setOperation] = useState<"assign" | "remove">("assign");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("Use a CSV smaller than 5 MB.");
      return;
    }

    setIsLoading(true);
    setMessage("");
    setPreview(null);
    setFileName(file.name);

    try {
      const values = extractGtinsFromCsv(await file.text());
      if (values.length === 0) throw new Error("No GTIN column or values were found.");
      if (values.length > 25_000) throw new Error("Use up to 25,000 GTIN rows per CSV.");
      setGtins(values);
      setPreview(await requestImport(brand.id, values, "preview"));
    } catch (error) {
      setGtins([]);
      setMessage(error instanceof Error ? error.message : "Unable to read this CSV.");
    } finally {
      setIsLoading(false);
    }
  }

  async function applyImport() {
    if (disabled || gtins.length === 0 || !preview?.matchedVariationCount) return;
    setIsLoading(true);
    setMessage("");

    try {
      const result = await requestImport(brand.id, gtins, operation) as BrandGtinMutationResponse;
      onApplied({ action: operation, assignedVariationCount: result.assignedVariationCount, variationIds: result.variationIds });
      setPreview(result);
      setMessage(`${result.matchedVariationCount.toLocaleString()} variation${result.matchedVariationCount === 1 ? "" : "s"} ${operation === "assign" ? "added to" : "removed from"} ${brand.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this Brand.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <details className="mt-5 rounded-md border border-border bg-surface-muted" open={Boolean(preview || message)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-cyan text-blue"><FileSpreadsheet aria-hidden="true" size={17} /></span>
          <span><span className="block text-sm font-semibold">Assign products by GTIN</span><span className="block text-xs text-secondary">CSV · one GTIN or UPC per row</span></span>
        </span>
        <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-semibold">{preview ? `${preview.matchedVariationCount.toLocaleString()} matches` : "Open"}</span>
      </summary>

      <div className="border-t border-border p-4">
        {disabled ? <p className="mb-3 rounded-md border border-yellow/40 bg-yellow/15 px-3 py-2 text-xs font-semibold">Save the Brand changes before importing products.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white ${disabled || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            <Upload className="mr-2" size={15} />Choose CSV
            <input accept=".csv,text/csv" className="sr-only" disabled={disabled || isLoading} onChange={selectFile} type="file" />
          </label>
          <button className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold" onClick={downloadTemplate} type="button"><Download className="mr-2" size={15} />Template</button>
          {fileName ? <span className="text-xs font-semibold text-secondary">{fileName}</span> : null}
        </div>

        {isLoading ? <p className="mt-3 text-xs font-semibold text-secondary">Checking GTINs against Square…</p> : null}
        {message ? <p aria-live="polite" className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold">{message}</p> : null}

        {preview ? (
          <div className="mt-4">
            <div className="grid gap-2 sm:grid-cols-4">
              <Metric label="Unique GTINs" value={preview.uniqueGtinCount} />
              <Metric label="Matched GTINs" tone="good" value={preview.matchedGtinCount} />
              <Metric label="Square variations" tone="good" value={preview.matchedVariationCount} />
              <Metric label="Not found" tone={preview.unmatchedGtinCount ? "warn" : "default"} value={preview.unmatchedGtinCount} />
            </div>

            {preview.invalidInputCount || preview.duplicateInputCount || preview.duplicateCatalogGtins.length ? (
              <p className="mt-3 text-xs text-secondary">
                {preview.invalidInputCount ? `${preview.invalidInputCount} invalid · ` : ""}
                {preview.duplicateInputCount ? `${preview.duplicateInputCount} repeated in CSV · ` : ""}
                {preview.duplicateCatalogGtins.length ? `${preview.duplicateCatalogGtins.length} GTINs match multiple Square variations` : ""}
              </p>
            ) : null}

            {preview.sampleMatches.length ? (
              <div className="mt-3 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
                {preview.sampleMatches.slice(0, 6).map((match) => (
                  <div className="min-w-0 bg-surface p-3" key={match.variationId}>
                    <p className="truncate text-sm font-semibold">{match.itemName}{/^(default|regular)$/i.test(match.variationName) ? "" : ` - ${match.variationName}`}</p>
                    <p className="mt-1 text-xs text-secondary">GTIN {match.gtin}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {preview.unmatchedGtins.length ? <p className="mt-3 break-words text-xs text-secondary"><strong>Not found:</strong> {preview.unmatchedGtins.slice(0, 12).join(", ")}{preview.unmatchedGtins.length > 12 ? ` +${preview.unmatchedGtins.length - 12} more` : ""}</p> : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold">Action<select className="admin-form-control admin-form-control--compact admin-native-select w-auto rounded-md border border-border bg-surface px-3 py-2" onChange={(event) => setOperation(event.target.value as "assign" | "remove")} value={operation}><option value="assign">Add to Brand</option><option value="remove">Remove from Brand</option></select></label>
              <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-green px-4 text-sm font-semibold text-primary disabled:opacity-40" disabled={disabled || isLoading || preview.matchedVariationCount === 0} onClick={() => void applyImport()} type="button"><Check className="mr-2" size={15} />{operation === "assign" ? "Add" : "Remove"} {preview.matchedVariationCount.toLocaleString()} variations</button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Metric({ label, tone = "default", value }: { label: string; tone?: "default" | "good" | "warn"; value: number }) {
  const toneClass = tone === "good" ? "bg-green/10" : tone === "warn" ? "bg-yellow/20" : "bg-surface";
  return <div className={`rounded-md border border-border p-3 ${toneClass}`}><p className="text-xl font-black">{value.toLocaleString()}</p><p className="text-xs font-semibold text-secondary">{label}</p></div>;
}

async function requestImport(brandId: string, gtins: string[], operation: "preview" | "assign" | "remove") {
  const response = await fetch("/api/admin/brand-gtin-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brandId, gtins, operation })
  });
  const result = await response.json() as BrandGtinPreview;
  if (!response.ok || !result.ok) throw new Error(result.error || "Unable to process this Brand CSV.");
  return result;
}

function extractGtinsFromCsv(text: string) {
  const table = parseCsvTable(text);
  const aliases = new Set(["gtin", "gtin-number", "upc", "upc-code", "barcode"]);
  let headerRow = -1;
  let gtinColumn = 0;

  for (let rowIndex = 0; rowIndex < Math.min(table.length, 20); rowIndex += 1) {
    const columnIndex = table[rowIndex].findIndex((cell) => aliases.has(normalizeHeader(String(cell ?? ""))));
    if (columnIndex >= 0) {
      headerRow = rowIndex;
      gtinColumn = columnIndex;
      break;
    }
  }

  const startRow = headerRow >= 0 ? headerRow + 1 : 0;
  return table.slice(startRow).map((row) => String(row[gtinColumn] ?? "").trim()).filter(Boolean);
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function downloadTemplate() {
  const blob = new Blob(["\uFEFFgtin\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "brand-gtin-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
