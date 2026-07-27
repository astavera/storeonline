/*
STORE AREA: Storefront
SECTION: Department Card Grid
SECTION ID: home.departments
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: First-class website department cards and navigation.
SAFE TO EDIT: Card layout, copy display, and accent styling.
DO NOT EDIT HERE: Square reporting categories, product eligibility, prices, or inventory.
RELATED FILES: src/config/departments.config.ts, src/config/header-navigation.config.ts
BUSINESS LOGIC FILES: src/features/departments/services/department-service.ts
*/

import Link from "next/link";
import Image from "next/image";
import { departments } from "@/config/departments.config";

export function DepartmentCardGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {departments
        .filter((department) => department.is_visible)
        .map((department) => (
          <Link className="group surface-card overflow-hidden" href={`/${department.slug}`} key={department.slug}>
            <div className="aspect-[4/3] bg-surface-muted">
              <Image alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" height={480} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" src={department.hero_image_url} unoptimized width={640} />
            </div>
            <div className="p-4">
              <span className="mb-3 block h-1 w-10 rounded-pill" style={{ backgroundColor: `var(${department.accent_color_token})` }} />
              <h3 className="font-display text-lg font-semibold">{department.title_en}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-secondary">{department.description_en}</p>
            </div>
          </Link>
        ))}
    </div>
  );
}
