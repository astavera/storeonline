import { departments } from "./departments.config";

export const primaryNavigation = departments
  .filter((department) => department.is_primary_nav && department.is_visible)
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((department) => ({
    label: department.title_en,
    href: `/${department.slug}`,
    sectionId: `${department.slug}.hero`
  }));

export const secondaryDepartmentNavigation = departments
  .filter((department) => !department.is_primary_nav && department.is_visible)
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((department) => ({
    label: department.title_en,
    href: `/${department.slug}`,
    sectionId: `${department.slug}.hero`
  }));

export const campaignNavigation = [
  {
    label: "Holidays",
    href: "/holidays",
    sectionId: "holidays.index-hero"
  }
];

export const utilityNavigation = [
  { label: "Locations", href: "/locations" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Search", href: "/search" },
  { label: "Cart", href: "/cart" }
];
