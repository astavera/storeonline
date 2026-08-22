/**
 * Shows the future homepage product-card layout only inside the Website Editor.
 */

export function HomepageProductCardPlaceholders({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5"
      data-homepage-product-placeholders="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <article
          aria-hidden="true"
          className="flex min-h-[420px] flex-col overflow-hidden rounded-md border border-dashed border-black/15 bg-white"
          data-homepage-product-placeholder="true"
          key={index}
        >
          <div className="grid aspect-square place-items-center bg-[linear-gradient(135deg,#f4f7fb_0%,#ffffff_52%,#f8f2ff_100%)] p-6">
            <div className="grid size-24 place-items-center rounded-full border border-dashed border-black/15 bg-white/80 text-center text-[11px] font-black uppercase tracking-[0.12em] text-secondary">
              Product image
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="space-y-2">
              <div className="h-3 w-20 rounded-full bg-black/10" />
              <div className="h-5 w-4/5 rounded-full bg-black/15" />
              <div className="h-5 w-3/5 rounded-full bg-black/10" />
            </div>
            <div className="mt-auto space-y-3">
              <div className="h-6 w-24 rounded-full bg-black/15" />
              <div className="h-12 rounded-pill bg-black/10" />
            </div>
          </div>
        </article>
      ))}
      <p className="sr-only" role="status">
        Product slots are ready. Connect catalog products to publish this section.
      </p>
    </div>
  );
}
