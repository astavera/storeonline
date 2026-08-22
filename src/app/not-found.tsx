/**
 * Renders the storefront fallback shown when a route cannot be found.
 */

import { ArrowLeft, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative isolate grid min-h-[78svh] overflow-hidden bg-white px-4 py-14 sm:py-20" data-store-section="storefront.not-found">
      <div aria-hidden="true" className="absolute left-[8%] top-[16%] size-3 rotate-12 rounded-sm bg-red sm:size-4" />
      <div aria-hidden="true" className="absolute right-[10%] top-[12%] size-3 rotate-45 bg-yellow sm:size-4" />
      <div aria-hidden="true" className="absolute bottom-[18%] left-[12%] h-3 w-7 -rotate-12 rounded-pill bg-green sm:h-4 sm:w-9" />
      <div aria-hidden="true" className="absolute bottom-[13%] right-[12%] size-4 rounded-full bg-cyan sm:size-5" />

      <section aria-labelledby="not-found-title" className="relative mx-auto flex w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="relative flex w-full items-center justify-center">
          <span aria-hidden="true" className="absolute select-none font-display text-[clamp(7rem,25vw,14rem)] font-black leading-none tracking-[-0.08em] text-blue opacity-[0.07]">
            404
          </span>
          <Image
            alt=""
            aria-hidden="true"
            className="relative z-10 h-auto w-[min(70vw,23rem)] drop-shadow-[0_24px_24px_rgba(7,43,99,0.13)]"
            height={1254}
            priority
            sizes="(max-width: 640px) 70vw, 368px"
            src="/images/not-found-ribbon-mascot.png"
            width={1254}
          />
        </div>

        <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-blue sm:text-sm">Wrong turn</p>
        <h1 className="mt-3 max-w-2xl font-display text-3xl font-black leading-[1.05] tracking-tight text-primary sm:text-5xl" id="not-found-title">
          Looks like this page got a little tangled up.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
          The page you&apos;re looking for isn&apos;t here. Let&apos;s get you back to the good stuff.
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink className="min-w-40 gap-2 rounded-pill bg-navy px-7 font-black text-white hover:bg-blue hover:opacity-100" href="/">
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.5} />
            Back to home
          </ButtonLink>
          <ButtonLink className="min-w-40 gap-2 rounded-pill border-navy px-7 font-black text-navy hover:border-blue hover:bg-surface-muted hover:text-blue" href="/shop" variant="secondary">
            <ShoppingBag aria-hidden="true" size={18} strokeWidth={2.5} />
            Shop all
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
