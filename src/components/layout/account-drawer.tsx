/** Responsive passwordless customer account drawer. */

"use client";

import { ArrowLeft, Check, ChevronRight, Heart, LockKeyhole, Mail, Package, UserRound, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setWishlistPanelOpen } from "@/components/commerce/wishlist-store";
import { isAccountPanelOpen, setAccountPanelOpen, subscribeToAccountPanel } from "@/components/customers/account-store";
import type { PublicCustomerAccount } from "@/features/customers/contracts";

type AccountSessionResponse = {
  ok: boolean;
  account: PublicCustomerAccount | null;
  developmentPreview?: boolean;
  error?: string;
};

type ChallengeResponse = {
  ok: boolean;
  challengeId?: string;
  maskedEmail?: string;
  developmentCode?: string;
  error?: string;
};

export function AccountDrawer() {
  const open = useSyncExternalStore(subscribeToAccountPanel, isAccountPanelOpen, () => false);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [account, setAccount] = useState<PublicCustomerAccount | null>(null);
  const [developmentPreview, setDevelopmentPreview] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [challenge, setChallenge] = useState<{ id: string; maskedEmail: string; developmentCode?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/account", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Account service unavailable");
        return response.json() as Promise<AccountSessionResponse>;
      })
      .then((response) => {
        setAccount(response.account);
        setDevelopmentPreview(Boolean(response.developmentPreview));
        setSessionStatus("ready");
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setSessionStatus("error");
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAccountPanelOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  async function startLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
          termsAccepted: formData.get("termsAccepted") === "on",
          marketingConsent: formData.get("marketingConsent") === "on"
        })
      });
      const body = await response.json() as ChallengeResponse;
      if (!response.ok || !body.challengeId || !body.maskedEmail) throw new Error(body.error || "Sign-in could not be started.");
      setChallenge({ id: body.challengeId, maskedEmail: body.maskedEmail, developmentCode: body.developmentCode });
      setStep("code");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Sign-in could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, code: String(formData.get("code") ?? "") })
      });
      const body = await response.json() as AccountSessionResponse;
      if (!response.ok || !body.account) throw new Error(body.error || "That code could not be verified.");
      setAccount(body.account);
      setStep("email");
      setChallenge(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "That code could not be verified.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1001]" data-store-component="AccountDrawer">
      <button aria-label="Close account backdrop" className="absolute inset-0 cursor-default bg-primary/40 backdrop-blur-[1px]" onClick={() => setAccountPanelOpen(false)} tabIndex={-1} type="button" />
      <aside
        aria-labelledby="account-drawer-title"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] min-h-[70dvh] flex-col overflow-hidden rounded-t-2xl bg-white text-primary shadow-2xl sm:inset-y-0 sm:left-auto sm:max-h-none sm:min-h-0 sm:w-[min(29rem,94vw)] sm:rounded-none"
        id="storefront-account-drawer"
        ref={panelRef}
        role="dialog"
      >
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            {step === "code" && !account ? (
              <button aria-label="Use a different email" className="grid min-h-11 w-11 place-items-center rounded-full hover:bg-surface-muted" onClick={() => { setStep("email"); setChallenge(null); setError(""); }} type="button">
                <ArrowLeft aria-hidden="true" size={20} />
              </button>
            ) : null}
            <div>
              <h2 className="font-display text-xl font-black" id="account-drawer-title">{account ? "Your account" : step === "code" ? "Check your email" : "Your account"}</h2>
              {account ? <p className="mt-0.5 text-xs font-semibold text-secondary">Signed in securely</p> : null}
            </div>
          </div>
          <button aria-label="Close account" className="grid min-h-11 w-11 place-items-center rounded-full transition hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-blue" onClick={() => setAccountPanelOpen(false)} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7 sm:py-7">
          {sessionStatus === "idle" || sessionStatus === "loading" ? <AccountLoading /> : null}
          {sessionStatus === "error" ? <AccountUnavailable onRetry={() => { setSessionStatus("idle"); setAccountPanelOpen(false); window.setTimeout(() => setAccountPanelOpen(true), 0); }} /> : null}
          {sessionStatus === "ready" && account ? (
            <SignedInAccount account={account} developmentPreview={developmentPreview} onAccountChange={setAccount} />
          ) : null}
          {sessionStatus === "ready" && !account && step === "email" ? (
            <EmailStep error={error} onSubmit={startLogin} submitting={submitting} />
          ) : null}
          {sessionStatus === "ready" && !account && step === "code" && challenge ? (
            <CodeStep challenge={challenge} error={error} onSubmit={verifyCode} submitting={submitting} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function EmailStep({ error, onSubmit, submitting }: { error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean }) {
  return (
    <form onSubmit={onSubmit}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-blue/10 text-blue"><UserRound aria-hidden="true" size={23} /></span>
      <h3 className="mt-5 font-display text-2xl font-black leading-tight">Sign in or create an account</h3>
      <p className="mt-2 text-sm leading-relaxed text-secondary">Access your preferences and saved shopping tools. No password required.</p>

      <label className="mt-7 block text-sm font-black" htmlFor="customer-account-email">Email</label>
      <div className="mt-2 flex min-h-12 items-center gap-3 rounded-md border border-slate-400 bg-white px-4 focus-within:border-slate-500" data-account-field-shell>
        <Mail aria-hidden="true" className="shrink-0 text-secondary" size={19} />
        <input autoComplete="email" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" data-account-field id="customer-account-email" name="email" placeholder="you@example.com" required type="email" />
      </div>

      <div className="mt-6 grid gap-4 rounded-lg bg-surface-muted p-4">
        <CheckboxField name="termsAccepted" required>
          I agree to the <LegalLink href="/terms">Terms of Use</LegalLink> and acknowledge the <LegalLink href="/privacy-policy">Privacy Policy</LegalLink>.
        </CheckboxField>
        <CheckboxField name="marketingConsent">
          Email me special offers, new arrivals, and store updates. I can unsubscribe at any time.
        </CheckboxField>
      </div>

      {error ? <InlineError message={error} /> : null}
      <button className="mt-6 min-h-12 w-full rounded-md bg-blue px-5 py-3 text-sm font-black text-white transition hover:bg-[#104a9e] disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">
        {submitting ? "Sending code…" : "Continue with email"}
      </button>
      <button className="mt-2 min-h-12 w-full rounded-md px-5 py-3 text-sm font-black text-secondary hover:bg-surface-muted hover:text-primary" onClick={() => setAccountPanelOpen(false)} type="button">Continue as guest</button>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs font-semibold text-secondary"><LockKeyhole aria-hidden="true" size={14} /> Secure passwordless sign-in</p>
    </form>
  );
}

function CodeStep({ challenge, error, onSubmit, submitting }: { challenge: { maskedEmail: string; developmentCode?: string }; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean }) {
  return (
    <form onSubmit={onSubmit}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-blue/10 text-blue"><Mail aria-hidden="true" size={22} /></span>
      <h3 className="mt-5 font-display text-2xl font-black">Enter your code</h3>
      <p className="mt-2 text-sm leading-relaxed text-secondary">We sent a six-digit verification code to <strong className="text-primary">{challenge.maskedEmail}</strong>. It expires in 10 minutes.</p>

      {challenge.developmentCode ? (
        <div className="mt-5 rounded-md border border-blue/20 bg-blue/5 p-4 text-sm" data-development-code>
          <p className="font-black text-blue">Development preview</p>
          <p className="mt-1 text-secondary">Use code <strong className="font-mono text-lg tracking-[0.18em] text-primary">{challenge.developmentCode}</strong>. No email was sent.</p>
        </div>
      ) : null}

      <label className="mt-7 block text-sm font-black" htmlFor="customer-account-code">Verification code</label>
      <input
        autoComplete="one-time-code"
        autoFocus
        className="mt-2 min-h-14 w-full rounded-md border border-slate-400 bg-white px-4 text-center font-mono text-2xl font-black tracking-[0.35em] outline-none focus:border-slate-500"
        data-account-field
        id="customer-account-code"
        inputMode="numeric"
        maxLength={6}
        name="code"
        pattern="[0-9]{6}"
        placeholder="000000"
        required
      />
      {error ? <InlineError message={error} /> : null}
      <button className="mt-6 min-h-12 w-full rounded-md bg-blue px-5 py-3 text-sm font-black text-white transition hover:bg-[#104a9e] disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">
        {submitting ? "Verifying…" : "Verify and continue"}
      </button>
      <button className="mt-2 min-h-12 w-full rounded-md px-5 py-3 text-sm font-black text-secondary hover:bg-surface-muted hover:text-primary" onClick={() => { setAccountPanelOpen(false); }} type="button">Continue as guest</button>
    </form>
  );
}

function SignedInAccount({ account, developmentPreview, onAccountChange }: { account: PublicCustomerAccount; developmentPreview: boolean; onAccountChange: (account: PublicCustomerAccount | null) => void }) {
  const [savingPreference, setSavingPreference] = useState(false);
  const [message, setMessage] = useState("");
  const initial = (account.firstName || account.email).slice(0, 1).toUpperCase();

  async function updatePreference(consent: boolean) {
    const previous = account;
    onAccountChange({ ...account, marketingEmailConsent: consent });
    setSavingPreference(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketingEmailConsent: consent }) });
      const body = await response.json() as AccountSessionResponse;
      if (!response.ok || !body.account) throw new Error(body.error || "Preference could not be saved.");
      onAccountChange(body.account);
      setMessage(consent ? "Email offers are on." : "Email offers are off.");
    } catch (requestError) {
      onAccountChange(previous);
      setMessage(requestError instanceof Error ? requestError.message : "Preference could not be saved.");
    } finally {
      setSavingPreference(false);
    }
  }

  async function signOut() {
    await fetch("/api/account/auth/logout", { method: "POST" }).catch(() => undefined);
    onAccountChange(null);
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-blue text-xl font-black text-white">{initial}</span>
        <div className="min-w-0">
          <p className="font-display text-xl font-black">Welcome back</p>
          <p className="truncate text-sm text-secondary">{account.email}</p>
        </div>
      </div>
      {developmentPreview ? <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Development preview · account data is not written to production.</p> : null}

      <div className="mt-7 grid gap-3">
        <div className="flex items-center gap-4 rounded-lg border border-border p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-muted"><Package aria-hidden="true" size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-black">Orders</p>
            <p className="mt-0.5 text-xs leading-relaxed text-secondary">Order history will be enabled after secure checkout ownership is connected.</p>
          </div>
        </div>
        <button className="flex min-h-16 items-center gap-4 rounded-lg border border-border p-4 text-left transition hover:border-blue" onClick={() => { setAccountPanelOpen(false); setWishlistPanelOpen(true); }} type="button">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-muted"><Heart aria-hidden="true" size={19} /></span>
          <span className="min-w-0 flex-1"><strong className="block">Wishlist</strong><span className="mt-0.5 block text-xs text-secondary">Open saved items without leaving this page.</span></span>
          <ChevronRight aria-hidden="true" className="shrink-0 text-secondary" size={18} />
        </button>
      </div>

      <section className="mt-8 border-t border-border pt-7" aria-labelledby="communication-preferences-title">
        <h3 className="font-display text-lg font-black" id="communication-preferences-title">Communication preferences</h3>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black">Email offers</p>
            <p className="mt-1 text-xs leading-relaxed text-secondary">Special offers, new arrivals, and store updates.</p>
          </div>
          <label className="relative mt-0.5 inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center">
            <input aria-label="Email offers" checked={account.marketingEmailConsent} className="peer sr-only" disabled={savingPreference} onChange={(event) => void updatePreference(event.target.checked)} type="checkbox" />
            <span className="h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-blue peer-focus-visible:ring-2 peer-focus-visible:ring-blue peer-focus-visible:ring-offset-2 peer-disabled:opacity-60" />
            <span className="pointer-events-none absolute left-[7px] h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </label>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-md bg-surface-muted p-4">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green text-white"><Check aria-hidden="true" size={13} strokeWidth={3} /></span>
          <div><p className="text-sm font-black">Transactional emails</p><p className="mt-1 text-xs leading-relaxed text-secondary">Orders, returns, pickup updates, and account security. Required.</p></div>
        </div>
        <p aria-live="polite" className="mt-3 min-h-5 text-xs font-bold text-secondary">{message}</p>
      </section>

      <button className="mt-6 min-h-12 w-full rounded-md border border-primary px-5 py-3 text-sm font-black transition hover:bg-primary hover:text-white" onClick={() => void signOut()} type="button">Sign out</button>
    </div>
  );
}

function CheckboxField({ children, name, required = false }: { children: React.ReactNode; name: string; required?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-xs font-semibold leading-relaxed text-secondary">
      <input className="mt-0.5 h-5 w-5 shrink-0 accent-blue" name={name} required={required} type="checkbox" />
      <span>{children}</span>
    </label>
  );
}

function LegalLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <Link className="font-black text-primary underline underline-offset-2" href={href} rel="noreferrer" target="_blank">{children}</Link>;
}

function InlineError({ message }: { message: string }) {
  return <p aria-live="polite" className="mt-4 rounded-md bg-red/10 px-4 py-3 text-sm font-bold text-danger" role="alert">{message}</p>;
}

function AccountLoading() {
  return <div aria-label="Loading account" className="grid gap-4" role="status"><div className="h-12 w-12 animate-pulse rounded-full bg-surface-muted" /><div className="h-8 w-3/4 animate-pulse rounded bg-surface-muted" /><div className="h-24 animate-pulse rounded-lg bg-surface-muted" /><div className="h-24 animate-pulse rounded-lg bg-surface-muted" /></div>;
}

function AccountUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="grid min-h-72 place-items-center text-center"><div><p className="font-display text-xl font-black">Account unavailable</p><p className="mx-auto mt-2 max-w-xs text-sm text-secondary">We could not load account services. You can continue shopping as a guest.</p><button className="mt-5 min-h-11 rounded-md bg-blue px-5 py-2.5 text-sm font-black text-white" onClick={onRetry} type="button">Try again</button></div></div>;
}
