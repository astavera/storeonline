/**
 * Keeps unfinished holiday routes available with a friendly storefront state.
 */

import Image from "next/image";

export function HolidayComingSoon({ holidayName }: { holidayName: string }) {
  return (
    <main className="relative isolate grid min-h-[78svh] overflow-hidden bg-white px-4 py-14 sm:py-20" data-store-section="holiday.coming-soon">
      <div aria-hidden="true" className="absolute left-[8%] top-[16%] size-3 rotate-12 rounded-sm bg-red sm:size-4" />
      <div aria-hidden="true" className="absolute right-[10%] top-[12%] size-3 rotate-45 bg-yellow sm:size-4" />
      <div aria-hidden="true" className="absolute bottom-[18%] left-[12%] h-3 w-7 -rotate-12 rounded-pill bg-green sm:h-4 sm:w-9" />
      <div aria-hidden="true" className="absolute bottom-[13%] right-[12%] size-4 rounded-full bg-cyan sm:size-5" />

      <section aria-labelledby="holiday-coming-soon-title" className="relative mx-auto flex w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="relative flex w-full items-center justify-center">
          <span aria-hidden="true" className="absolute select-none font-display text-[clamp(5rem,20vw,11rem)] font-black leading-none tracking-[-0.08em] text-blue opacity-[0.07]">
            SOON
          </span>
          <Image
            alt=""
            aria-hidden="true"
            className="relative z-10 h-auto w-[min(62vw,19rem)] drop-shadow-[0_24px_24px_rgba(7,43,99,0.13)]"
            height={1254}
            priority
            sizes="(max-width: 640px) 62vw, 304px"
            src="/images/not-found-ribbon-mascot.png"
            width={1254}
          />
        </div>

        <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-blue sm:text-sm">{holidayName}</p>
        <h1 className="mt-3 max-w-2xl font-display text-3xl font-black leading-[1.05] tracking-tight text-primary sm:text-5xl" id="holiday-coming-soon-title">
          You&apos;ll find products here very soon.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
          We&apos;re getting this holiday collection ready. Check back soon for seasonal favorites.
        </p>
      </section>
    </main>
  );
}
