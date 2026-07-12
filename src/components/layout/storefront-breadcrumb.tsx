import Link from "next/link";

export function StorefrontBreadcrumb({ currentLabel }: { currentLabel: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-sm font-black text-primary" data-cms-edit-field="breadcrumbs">
      <Link className="text-primary hover:underline" href="/">
        Home
      </Link>
      <span aria-hidden="true" className="mx-2 text-primary">
        {"\u203A"}
      </span>
      <span className="text-primary">{currentLabel}</span>
    </nav>
  );
}
