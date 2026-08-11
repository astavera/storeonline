/**
 * Reserves the approved department layout while route data is loading.
 */

export function DepartmentPageLoading() {
  return (
    <main aria-busy="true" aria-label="Loading department" className="animate-pulse bg-surface motion-reduce:animate-none">
      <div className="aspect-[4/3] bg-surface-muted sm:aspect-[16/7] lg:aspect-[3/1]" />
      <div className="grid grid-cols-2 md:grid-cols-3">
        <div className="col-span-2 h-16 bg-blue/20 md:col-span-1" />
        <div className="h-16 bg-yellow/25" />
        <div className="h-16 bg-red/20" />
      </div>
      <section className="container-shell py-12">
        <div className="h-8 w-56 rounded bg-surface-muted" />
        <div className="mt-8 department-product-grid grid gap-4">
          {Array.from({ length: 10 }, (_, index) => (
            <div className="min-h-64 rounded-md bg-surface-muted" key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
