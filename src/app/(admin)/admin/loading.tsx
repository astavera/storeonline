export default function AdminLoading() {
  return (
    <main aria-busy="true" aria-label="Loading Admin workspace" className="admin-page admin-overview">
      <span className="sr-only">Loading Admin workspace</span>
      <header className="admin-overview-header animate-pulse">
        <div className="h-8 w-52 rounded bg-slate-200" />
        <div className="h-11 w-44 rounded bg-slate-100" />
      </header>
      <section className="admin-overview-metrics animate-pulse">
        {[0, 1, 2, 3].map((item) => <article className="admin-overview-metric" key={item}><div className="h-3 w-24 rounded bg-slate-100" /><div className="mt-3 h-7 w-20 rounded bg-slate-200" /></article>)}
      </section>
      <div className="admin-overview-grid animate-pulse">
        <section className="admin-panel h-64" />
        <section className="admin-panel h-64" />
      </div>
    </main>
  );
}
