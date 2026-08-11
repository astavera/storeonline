"use client";

/**
 * Implements the mobile-first returns stepper. It displays server decisions and
 * never calculates eligibility, payer responsibility, or refund values.
 */

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Upload
} from "lucide-react";
import {
  companyPaidReturnReasons,
  packingInstructions,
  returnPolicyCopy,
  returnReasonOptions,
  type ReturnLineSelection,
  type ReturnQuoteView,
  type ReturnReason,
  type VerifiedReturnOrder
} from "@/features/returns/contracts";

const steps = ["Find order", "Select items", "Return details", "Review", "Confirmation"] as const;
type Step = 1 | 2 | 3 | 4 | 5;

type SelectionDraft = ReturnLineSelection & {
  selected: boolean;
  uploading: boolean;
  uploadError: string | null;
};

type ReturnRequestView = {
  rmaNumber: string;
  status: string;
  items: Array<{
    orderLineId: string;
    name: string;
    variant: string | null;
    quantity: number;
    reason: string;
    decision: string;
    decisionReason: string | null;
  }>;
  carrier: string | null;
  serviceLevel: string | null;
  trackingNumber: string | null;
  labelExpiresAt: string | null;
  estimatedNetRefundCents: number;
  finalApprovedRefundCents: number | null;
  labelDownloadUrl: string | null;
  packingSlipDownloadUrl: string;
  events: Array<{ status: string; source: string; occurredAt: string }>;
};

export function ReturnsPortal() {
  const [step, setStep] = useState<Step>(1);
  const [verificationHandle, setVerificationHandle] = useState("");
  const [verificationExpiresAt, setVerificationExpiresAt] = useState("");
  const [order, setOrder] = useState<VerifiedReturnOrder | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SelectionDraft>>({});
  const [quote, setQuote] = useState<ReturnQuoteView | null>(null);
  const [requestView, setRequestView] = useState<ReturnRequestView | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);

  const selectedDrafts = useMemo(
    () => Object.values(drafts).filter((draft) => draft.selected),
    [drafts]
  );

  async function startVerification(formData: FormData) {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/returns/verification/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: String(formData.get("orderNumber") ?? ""),
          email: String(formData.get("email") ?? ""),
          postalCode: String(formData.get("postalCode") ?? "")
        })
      });
      const result = await response.json() as {
        ok: boolean;
        message: string;
        verificationHandle?: string;
        expiresAt?: string;
      };
      setMessage({ tone: result.ok ? "success" : "info", text: result.message });
      if (result.verificationHandle && result.expiresAt) {
        setVerificationHandle(result.verificationHandle);
        setVerificationExpiresAt(result.expiresAt);
      }
    } catch {
      setMessage({ tone: "error", text: "The returns service could not be reached. Please retry." });
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmVerification(formData: FormData) {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/returns/verification/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verificationHandle,
          code: String(formData.get("code") ?? "")
        })
      });
      const result = await response.json() as { ok: boolean; order?: VerifiedReturnOrder; message?: string };
      if (!response.ok || !result.order) throw new Error(result.message);
      setOrder(result.order);
      setDrafts(Object.fromEntries(result.order.lines.map((line) => [
        line.orderLineId,
        {
          selected: false,
          orderLineId: line.orderLineId,
          quantity: Math.min(1, line.eligibleQuantity),
          reason: "CHANGED_MIND" as const,
          comment: "",
          evidenceReferences: [],
          declaredUnused: false,
          declaredOriginalPackaging: false,
          declaredSealUnopened: false,
          partyOpened: false,
          uploading: false,
          uploadError: null
        }
      ])));
      setMessage(null);
      setStep(2);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error && error.message
          ? error.message
          : "We could not verify those details. Check the code and try again."
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadEvidence(orderLineId: string, file: File) {
    if (!order) return;
    updateDraft(orderLineId, { uploading: true, uploadError: null });
    const formData = new FormData();
    formData.set("orderLineId", orderLineId);
    formData.set("file", file);
    try {
      const response = await fetch("/api/returns/evidence", { method: "POST", body: formData });
      const result = await response.json() as { ok: boolean; evidenceReference?: string; message?: string };
      const evidenceReference = result.evidenceReference;
      if (!response.ok || !evidenceReference) throw new Error(result.message);
      setDrafts((current) => ({
        ...current,
        [orderLineId]: {
          ...current[orderLineId],
          evidenceReferences: [
            ...(current[orderLineId]?.evidenceReferences ?? []),
            evidenceReference
          ],
          uploading: false,
          uploadError: null
        }
      }));
    } catch (error) {
      updateDraft(orderLineId, {
        uploading: false,
        uploadError: error instanceof Error && error.message
          ? error.message
          : "Photo upload failed. Please retry."
      });
    }
  }

  async function requestQuote() {
    if (!order) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/returns/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections: toSelections(selectedDrafts) })
      });
      const result = await response.json() as { ok: boolean; quote?: ReturnQuoteView; message?: string };
      if (!response.ok || !result.quote) throw new Error(result.message);
      setQuote(result.quote);
      setStep(4);
      if (result.quote.blockingReasons.length > 0) {
        setMessage({ tone: "error", text: result.quote.blockingReasons.join(" ") });
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error && error.message
          ? error.message
          : "We could not calculate this return."
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function createRequest(formData: FormData) {
    if (!order || !quote) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": ensureIdempotencyKey(quote.quoteToken)
        },
        body: JSON.stringify({
          quoteToken: quote.quoteToken,
          selections: toSelections(selectedDrafts),
          policyAccepted: formData.get("policyAccepted") === "on",
          conditionAccepted: formData.get("conditionAccepted") === "on",
          labelDeductionAccepted: formData.get("labelDeductionAccepted") === "on"
        })
      });
      const result = await response.json() as {
        ok: boolean;
        request?: ReturnRequestView;
        emailDispatched?: boolean;
        message?: string;
      };
      if (!response.ok || !result.request) throw new Error(result.message);
      setRequestView(result.request);
      setStep(5);
      setMessage({
        tone: "success",
        text: result.emailDispatched
          ? "Your return was created and the details were emailed to you."
          : "Your return was created. Save the RMA number shown below."
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error && error.message
          ? error.message
          : "We could not create this return. Please retry."
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshStatus() {
    if (!order || !requestView) return;
    setIsBusy(true);
    try {
      const response = await fetch(`/api/returns/${encodeURIComponent(requestView.rmaNumber)}`);
      const result = await response.json() as { ok: boolean; request?: ReturnRequestView; message?: string };
      if (!response.ok || !result.request) throw new Error(result.message);
      setRequestView(result.request);
      setMessage({ tone: "success", text: "Return status updated." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error && error.message ? error.message : "Status could not be refreshed."
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function downloadDocument(url: string, filename: string) {
    if (!order) return;
    setIsBusy(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("The document is not available yet.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The document could not be downloaded."
      });
    } finally {
      setIsBusy(false);
    }
  }

  function updateDraft(orderLineId: string, patch: Partial<SelectionDraft>) {
    setDrafts((current) => ({
      ...current,
      [orderLineId]: { ...current[orderLineId], ...patch }
    }));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Online returns</p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">Start or track a return</h1>
        <p className="mt-4 text-lg text-secondary">
          Verify your order securely, review eligibility and costs, then receive an RMA and return documents.
        </p>
      </header>

      <Stepper currentStep={step} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby={`returns-step-${step}`} className="surface-card p-5 sm:p-8">
            {message ? <StatusMessage {...message} /> : null}

            {step === 1 ? (
              <FindOrderStep
                busy={isBusy}
                expiresAt={verificationExpiresAt}
                hasChallenge={Boolean(verificationHandle)}
                onConfirm={confirmVerification}
                onStart={startVerification}
              />
            ) : null}

            {step === 2 && order ? (
              <SelectItemsStep
                drafts={drafts}
                onBack={() => setStep(1)}
                onContinue={() => {
                  setMessage(null);
                  setStep(3);
                }}
                onUpdate={updateDraft}
                order={order}
                selectedCount={selectedDrafts.length}
              />
            ) : null}

            {step === 3 && order ? (
              <ReturnDetailsStep
                busy={isBusy}
                drafts={selectedDrafts}
                onBack={() => setStep(2)}
                onContinue={requestQuote}
                onEvidence={uploadEvidence}
                onUpdate={updateDraft}
                order={order}
              />
            ) : null}

            {step === 4 && quote ? (
              <ReviewStep
                busy={isBusy}
                onBack={() => setStep(3)}
                onConfirm={createRequest}
                quote={quote}
              />
            ) : null}

            {step === 5 && requestView ? (
              <ConfirmationStep
                busy={isBusy}
                onDownload={downloadDocument}
                onRefresh={refreshStatus}
                request={requestView}
              />
            ) : null}
          </section>

          <details className="surface-card p-5">
            <summary className="cursor-pointer font-semibold">Return policy</summary>
            <div className="mt-4 whitespace-pre-line text-sm leading-6 text-secondary">{returnPolicyCopy}</div>
          </details>
        </div>

        <aside className="space-y-5">
          <section className="surface-card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Your information is protected</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Order details appear only after email verification. Eligibility, label cost and refund estimates are recalculated on the server.
            </p>
          </section>

          <section className="surface-card p-5">
            <h2 className="font-semibold">Need help with an exception?</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Support can review unusual damage, delivery or product-condition claims.
            </p>
            <Link className="mt-4 inline-flex font-semibold text-primary underline underline-offset-4" href="/contact">
              Contact Support
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stepper({ currentStep }: { currentStep: Step }) {
  return (
    <nav aria-label="Return progress" className="mt-10 overflow-x-auto pb-2">
      <ol className="flex min-w-[680px] items-start">
        {steps.map((label, index) => {
          const number = index + 1;
          const complete = number < currentStep;
          const current = number === currentStep;
          return (
            <li
              aria-current={current ? "step" : undefined}
              className="relative flex flex-1 flex-col items-center text-center"
              key={label}
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-4 h-px w-full ${complete || current ? "bg-primary" : "bg-border"}`}
                />
              ) : null}
              <span
                className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border text-sm font-semibold ${
                  complete || current
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-secondary"
                }`}
              >
                {complete ? <Check aria-hidden="true" className="h-4 w-4" /> : number}
              </span>
              <span className={`mt-2 text-xs font-medium ${current ? "text-primary" : "text-secondary"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function FindOrderStep({
  busy,
  expiresAt,
  hasChallenge,
  onConfirm,
  onStart
}: {
  busy: boolean;
  expiresAt: string;
  hasChallenge: boolean;
  onConfirm(formData: FormData): void;
  onStart(formData: FormData): void;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold" id="returns-step-1">Find your order</h2>
      <p className="mt-2 text-secondary">Use the same email and billing or delivery ZIP from checkout.</p>
      {!hasChallenge ? (
        <form action={onStart} className="mt-6 space-y-5">
          <Field label="Order number" name="orderNumber" placeholder="Example: MS-10482" required />
          <Field autoComplete="email" label="Email used for the order" name="email" required type="email" />
          <Field autoComplete="postal-code" label="Billing or delivery ZIP" name="postalCode" required />
          <PrimaryButton busy={busy} label="Send verification code" />
        </form>
      ) : (
        <form action={onConfirm} className="mt-6 space-y-5">
          <Field
            autoComplete="one-time-code"
            inputMode="numeric"
            label="Verification code"
            name="code"
            placeholder="Enter the code from your email"
            required
          />
          <p className="text-sm text-secondary">
            Code expires {formatDateTime(expiresAt)}. Order details remain hidden until the code is accepted.
          </p>
          <PrimaryButton busy={busy} label="Verify order" />
        </form>
      )}
    </div>
  );
}

function SelectItemsStep({
  drafts,
  onBack,
  onContinue,
  onUpdate,
  order,
  selectedCount
}: {
  drafts: Record<string, SelectionDraft>;
  onBack(): void;
  onContinue(): void;
  onUpdate(id: string, patch: Partial<SelectionDraft>): void;
  order: VerifiedReturnOrder;
  selectedCount: number;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold" id="returns-step-2">Select items</h2>
      <p className="mt-2 text-secondary">
        Order {order.orderNumber}{order.deliveredAt ? ` · Delivered ${formatDate(order.deliveredAt)}` : ""}
      </p>
      <div className="mt-6 space-y-4">
        {order.lines.map((line) => {
          const draft = drafts[line.orderLineId];
          const disabled = line.eligibility === "INELIGIBLE" || line.eligibleQuantity < 1;
          return (
            <article className={`rounded-lg border p-4 ${disabled ? "border-border bg-surface-muted" : "border-border bg-surface"}`} key={line.orderLineId}>
              <div className="flex gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-muted">
                  {line.imageUrl ? (
                    <Image alt="" className="h-full w-full object-contain" height={80} src={line.imageUrl} unoptimized width={80} />
                  ) : <PackageCheck aria-hidden="true" className="h-8 w-8 text-secondary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="flex items-start gap-3 font-semibold">
                    <input
                      checked={draft?.selected ?? false}
                      className="mt-1 h-5 w-5 accent-primary"
                      disabled={disabled}
                      onChange={(event) => onUpdate(line.orderLineId, { selected: event.target.checked })}
                      type="checkbox"
                    />
                    <span>
                      {line.name}
                      {line.variant ? <span className="mt-1 block text-sm font-normal text-secondary">{line.variant}</span> : null}
                    </span>
                  </label>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-secondary sm:grid-cols-4">
                    <QuantityStat label="Purchased" value={line.purchasedQuantity} />
                    <QuantityStat label="Delivered" value={line.deliveredQuantity} />
                    <QuantityStat label="Returned" value={line.previouslyReturnedQuantity} />
                    <QuantityStat label="Eligible" value={line.eligibleQuantity} />
                  </dl>
                  <p className={`mt-3 text-sm font-medium ${disabled ? "text-red-700" : line.eligibility === "MANUAL_REVIEW" ? "text-amber-800" : "text-green-800"}`}>
                    {line.eligibility === "ELIGIBLE" ? "Eligible" : line.eligibility === "MANUAL_REVIEW" ? "Manual review" : "Not eligible"}
                    {line.eligibilityReason ? ` — ${line.eligibilityReason}` : ""}
                  </p>
                  {draft?.selected ? (
                    <label className="mt-4 block max-w-40 text-sm font-medium">
                      Quantity
                      <select
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
                        onChange={(event) => onUpdate(line.orderLineId, { quantity: Number(event.target.value) })}
                        value={draft.quantity}
                      >
                        {Array.from({ length: line.eligibleQuantity }, (_, index) => index + 1).map((quantity) => (
                          <option key={quantity} value={quantity}>{quantity}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <StepActions backLabel="Back" continueDisabled={selectedCount === 0} continueLabel="Return details" onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function ReturnDetailsStep({
  busy,
  drafts,
  onBack,
  onContinue,
  onEvidence,
  onUpdate,
  order
}: {
  busy: boolean;
  drafts: SelectionDraft[];
  onBack(): void;
  onContinue(): void;
  onEvidence(id: string, file: File): void;
  onUpdate(id: string, patch: Partial<SelectionDraft>): void;
  order: VerifiedReturnOrder;
}) {
  const invalid = drafts.some((draft) => {
    const photosRequired = ["ARRIVED_DAMAGED", "DEFECTIVE", "WRONG_ITEM_RECEIVED", "MISSING_PARTS"].includes(draft.reason);
    const regularReturn = !companyPaidReturnReasons.includes(draft.reason);
    return draft.uploading ||
      (regularReturn && (
        !draft.declaredUnused ||
        !draft.declaredOriginalPackaging ||
        !draft.declaredSealUnopened
      )) ||
      (draft.reason === "OTHER_PREFERENCE" && !draft.comment?.trim()) ||
      (photosRequired && draft.evidenceReferences.length === 0);
  });
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold" id="returns-step-3">Return details</h2>
      <p className="mt-2 text-secondary">Provide the reason and declared condition for each selected item.</p>
      <div className="mt-6 space-y-6">
        {drafts.map((draft) => {
          const line = order.lines.find((candidate) => candidate.orderLineId === draft.orderLineId)!;
          const photosRequired = ["ARRIVED_DAMAGED", "DEFECTIVE", "WRONG_ITEM_RECEIVED", "MISSING_PARTS"].includes(draft.reason);
          return (
            <fieldset className="rounded-lg border border-border p-4 sm:p-5" key={draft.orderLineId}>
              <legend className="px-2 font-semibold">{line.name} · Qty {draft.quantity}</legend>
              <label className="mt-2 block text-sm font-medium">
                Return reason
                <select
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3"
                  onChange={(event) => onUpdate(draft.orderLineId, { reason: event.target.value as ReturnReason })}
                  value={draft.reason}
                >
                  <optgroup label="Company-paid if the claim is approved">
                    {returnReasonOptions.filter((reason) => companyPaidReturnReasons.includes(reason.value as never)).map((reason) => (
                      <option key={reason.value} value={reason.value}>{reason.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Customer-paid label">
                    {returnReasonOptions.filter((reason) => !companyPaidReturnReasons.includes(reason.value as never)).map((reason) => (
                      <option key={reason.value} value={reason.value}>{reason.label}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="mt-4 block text-sm font-medium">
                Comment {draft.reason === "OTHER_PREFERENCE" ? "(required)" : "(optional)"}
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2"
                  maxLength={1000}
                  onChange={(event) => onUpdate(draft.orderLineId, { comment: event.target.value })}
                  value={draft.comment ?? ""}
                />
              </label>
              {photosRequired ? (
                <div className="mt-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary">
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    {draft.uploading ? "Uploading..." : "Upload evidence photo"}
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={draft.uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onEvidence(draft.orderLineId, file);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                  <p className="mt-2 text-xs text-secondary">JPG, PNG or WebP, up to 8 MB. At least one photo is required.</p>
                  {draft.evidenceReferences.length > 0 ? (
                    <p className="mt-2 text-sm font-medium text-green-800">{draft.evidenceReferences.length} photo(s) uploaded</p>
                  ) : null}
                  {draft.uploadError ? <p className="mt-2 text-sm text-red-700">{draft.uploadError}</p> : null}
                </div>
              ) : null}
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <ConditionCheck
                  checked={draft.declaredUnused}
                  label="The product is unused."
                  onChange={(checked) => onUpdate(draft.orderLineId, { declaredUnused: checked })}
                />
                <ConditionCheck
                  checked={draft.declaredOriginalPackaging}
                  label="The product has all original packaging, accessories and materials."
                  onChange={(checked) => onUpdate(draft.orderLineId, { declaredOriginalPackaging: checked })}
                />
                <ConditionCheck
                  checked={draft.declaredSealUnopened}
                  label="The original seal or package has not been opened."
                  onChange={(checked) => onUpdate(draft.orderLineId, { declaredSealUnopened: checked })}
                />
                {line.partyItem ? (
                  <ConditionCheck
                    checked={draft.partyOpened}
                    label="This Party item has been opened or used."
                    onChange={(checked) => onUpdate(draft.orderLineId, { partyOpened: checked })}
                  />
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </div>
      <StepActions
        backLabel="Back"
        busy={busy}
        continueDisabled={invalid}
        continueLabel="Review estimate"
        onBack={onBack}
        onContinue={onContinue}
      />
    </div>
  );
}

function ReviewStep({
  busy,
  onBack,
  onConfirm,
  quote
}: {
  busy: boolean;
  onBack(): void;
  onConfirm(formData: FormData): void;
  quote: ReturnQuoteView;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold" id="returns-step-4">Review your return</h2>
      <p className="mt-2 text-secondary">All amounts are estimated until WH01 receives and inspects the merchandise.</p>
      <div className="mt-6 space-y-3">
        {quote.lines.map((line) => (
          <div className="rounded-md border border-border p-4" key={line.orderLineId}>
            <div className="flex justify-between gap-4">
              <p className="font-semibold">{line.name}</p>
              <p className="text-sm">Qty {line.quantity}</p>
            </div>
            <p className="mt-1 text-sm text-secondary">{humanReason(line.reason)}</p>
            {line.decisionReason ? <p className="mt-2 text-sm font-medium text-amber-800">{line.decisionReason}</p> : null}
          </div>
        ))}
      </div>

      <dl className="mt-6 space-y-3 rounded-lg bg-surface-muted p-5 text-sm">
        <MoneyRow label="Estimated merchandise refund" value={quote.merchandiseRefundCents} />
        <MoneyRow label="Estimated tax refund" value={quote.estimatedTaxRefundCents} />
        <MoneyRow label="Discounts applied" value={-quote.discountAdjustmentCents} />
        <MoneyRow label="Original shipping (non-refundable)" value={-quote.originalShippingCents} muted />
        <MoneyRow label="Original local delivery (non-refundable)" value={-quote.originalLocalDeliveryCents} muted />
        {quote.refundableOriginalFeesCents > 0 ? <MoneyRow label="Original fees restored for approved company error" value={quote.refundableOriginalFeesCents} /> : null}
        <MoneyRow
          label={`Return label · ${payerLabel(quote.labelPayer)}`}
          value={quote.labelCostCents === null ? null : -quote.labelCostCents}
        />
        {quote.labelDeductionCents > 0 ? <MoneyRow label="Label deduction" value={-quote.labelDeductionCents} /> : null}
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-bold">
          <dt>Estimated net refund</dt>
          <dd>{money(quote.estimatedNetRefundCents)}</dd>
        </div>
      </dl>

      {quote.requiresManualReview ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          One or more claims require review. A free label will not be issued until the company-responsibility claim is approved.
        </p>
      ) : null}
      {quote.blockingReasons.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-800">
          {quote.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : null}

      <form action={onConfirm} className="mt-6 space-y-4">
        <ConditionCheck label="I accept the return policy." name="policyAccepted" required />
        <ConditionCheck label="I confirm that the product-condition statements are accurate." name="conditionAccepted" required />
        {quote.labelPayer === "CUSTOMER" ? (
          <ConditionCheck
            label={`I expressly accept the ${money(quote.labelDeductionCents)} return-label deduction from my final refund.`}
            name="labelDeductionAccepted"
            required
          />
        ) : (
          <input name="labelDeductionAccepted" type="hidden" value="off" />
        )}
        <p className="rounded-md border border-border p-4 text-sm text-secondary">
          Estimated refund is not the final approved refund. The final amount depends on receipt and inspection, and approved refunds go to the original payment method.
        </p>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
          <SecondaryButton label="Back" onClick={onBack} />
          <PrimaryButton busy={busy} disabled={!quote.canSubmit} label={quote.requiresManualReview ? "Submit for review" : "Create return"} />
        </div>
      </form>
    </div>
  );
}

function ConfirmationStep({
  busy,
  onDownload,
  onRefresh,
  request
}: {
  busy: boolean;
  onDownload(url: string, filename: string): void;
  onRefresh(): void;
  request: ReturnRequestView;
}) {
  const authorized = request.items.filter((item) => ["ELIGIBLE", "AUTHORIZED", "APPROVED"].includes(item.decision));
  const review = request.items.filter((item) => item.decision === "MANUAL_REVIEW");
  return (
    <div>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-800">
        <Check aria-hidden="true" className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-3xl font-semibold" id="returns-step-5">Return request received</h2>
      <div className="mt-5 rounded-lg border border-primary bg-surface p-5">
        <p className="text-sm text-secondary">RMA number</p>
        <p className="mt-1 font-display text-2xl font-bold">{request.rmaNumber}</p>
        <p className="mt-3 inline-flex rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold">{humanReason(request.status)}</p>
      </div>

      {authorized.length > 0 ? (
        <section className="mt-6">
          <h3 className="font-semibold">Authorized items</h3>
          <ul className="mt-2 space-y-2 text-sm text-secondary">
            {authorized.map((item) => <li key={item.orderLineId}>{item.quantity} × {item.name}</li>)}
          </ul>
        </section>
      ) : null}
      {review.length > 0 ? (
        <section className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Items under review</h3>
          <ul className="mt-2 space-y-2 text-sm text-amber-950">
            {review.map((item) => <li key={item.orderLineId}>{item.quantity} × {item.name}</li>)}
          </ul>
        </section>
      ) : null}

      <dl className="mt-6 grid gap-4 rounded-lg bg-surface-muted p-5 text-sm sm:grid-cols-2">
        <Description label="Carrier" value={request.carrier ?? "Pending authorization"} />
        <Description label="Tracking" value={request.trackingNumber ?? "Not available yet"} />
        <Description label="Use label by" value={request.labelExpiresAt ? formatDate(request.labelExpiresAt) : "Pending"} />
        <Description label="Estimated refund" value={money(request.estimatedNetRefundCents)} />
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {request.labelDownloadUrl ? (
          <button
            className={secondaryButtonClass}
            disabled={busy}
            onClick={() => onDownload(request.labelDownloadUrl!, `${request.rmaNumber}-return-label.pdf`)}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" /> Download return label
          </button>
        ) : null}
        <button
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => onDownload(request.packingSlipDownloadUrl, `${request.rmaNumber}-packing-slip.pdf`)}
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" /> Download return packing slip
        </button>
        <button className={secondaryButtonClass} disabled={busy} onClick={onRefresh} type="button">
          <RefreshCw aria-hidden="true" className="h-4 w-4" /> Refresh status
        </button>
      </div>

      <section className="mt-8 rounded-lg border border-border p-5">
        <h3 className="font-semibold">Packing instructions</h3>
        <p className="mt-3 text-sm leading-6 text-secondary">{packingInstructions}</p>
      </section>

      <section className="mt-8">
        <h3 className="font-semibold">Return timeline</h3>
        <ol className="mt-3 space-y-3 border-l border-border pl-5">
          {request.events.map((event, index) => (
            <li key={`${event.status}-${event.occurredAt}-${index}`}>
              <p className="text-sm font-semibold">{humanReason(event.status)}</p>
              <p className="text-xs text-secondary">{formatDateTime(event.occurredAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        {...inputProps}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-3 text-base"
      />
    </label>
  );
}

function ConditionCheck({
  checked,
  label,
  name,
  onChange,
  required
}: {
  checked?: boolean;
  label: string;
  name?: string;
  onChange?(checked: boolean): void;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        checked={checked}
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        name={name}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        required={required}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function StepActions({
  backLabel,
  busy,
  continueDisabled,
  continueLabel,
  onBack,
  onContinue
}: {
  backLabel: string;
  busy?: boolean;
  continueDisabled?: boolean;
  continueLabel: string;
  onBack(): void;
  onContinue(): void;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
      <SecondaryButton label={backLabel} onClick={onBack} />
      <button
        className={primaryButtonClass}
        disabled={busy || continueDisabled}
        onClick={onContinue}
        type="button"
      >
        {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
        {continueLabel}
        {!busy ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : null}
      </button>
    </div>
  );
}

function PrimaryButton({ busy, disabled, label }: { busy: boolean; disabled?: boolean; label: string }) {
  return (
    <button className={primaryButtonClass} disabled={busy || disabled} type="submit">
      {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {label}
      {!busy ? <ChevronRight aria-hidden="true" className="h-4 w-4" /> : null}
    </button>
  );
}

function SecondaryButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button className={secondaryButtonClass} onClick={onClick} type="button">
      <ChevronLeft aria-hidden="true" className="h-4 w-4" /> {label}
    </button>
  );
}

function StatusMessage({ text, tone }: { text: string; tone: "error" | "info" | "success" }) {
  const colors = tone === "error"
    ? "border-red-300 bg-red-50 text-red-950"
    : tone === "success"
      ? "border-green-300 bg-green-50 text-green-950"
      : "border-blue-300 bg-blue-50 text-blue-950";
  return (
    <div aria-live="polite" className={`mb-6 flex gap-3 rounded-md border p-4 text-sm ${colors}`} role={tone === "error" ? "alert" : "status"}>
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}

function QuantityStat({ label, value }: { label: string; value: number }) {
  return <div><dt>{label}</dt><dd className="font-semibold text-foreground">{value}</dd></div>;
}

function MoneyRow({ label, muted, value }: { label: string; muted?: boolean; value: number | null }) {
  return (
    <div className={`flex justify-between gap-4 ${muted ? "text-secondary" : ""}`}>
      <dt>{label}</dt>
      <dd>{value === null ? "Pending" : money(value)}</dd>
    </div>
  );
}

function Description({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-secondary">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}

function toSelections(drafts: SelectionDraft[]): ReturnLineSelection[] {
  return drafts.map((draft) => ({
    orderLineId: draft.orderLineId,
    quantity: draft.quantity,
    reason: draft.reason,
    comment: draft.comment,
    evidenceReferences: draft.evidenceReferences,
    declaredUnused: draft.declaredUnused,
    declaredOriginalPackaging: draft.declaredOriginalPackaging,
    declaredSealUnopened: draft.declaredSealUnopened,
    partyOpened: draft.partyOpened
  }));
}

function ensureIdempotencyKey(quoteToken: string) {
  const storageKey = `modern-state-return-idempotency-key:${quoteToken.slice(-16)}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, created);
  return created;
}

function humanReason(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function payerLabel(value: ReturnQuoteView["labelPayer"]) {
  if (value === "COMPANY") return "paid by Modern State";
  if (value === "CUSTOMER") return "deducted from refund";
  return "pending claim review";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York"
  }).format(new Date(value));
}

const primaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 py-3 font-semibold transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";
