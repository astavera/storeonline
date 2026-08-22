/** Builds storefront dropdowns exclusively from published, editable website categories. */

import type {
  DepartmentMenuContent,
  DepartmentMenuGroup,
  DepartmentMenuItem
} from "@/components/layout/department-mega-menu";
import {
  orderWebsiteCategories,
  websiteCategoryPath,
  type WebsiteCategory
} from "@/features/catalog/services/website-merchandising-service";

export type StorefrontDepartmentMenus = Record<string, DepartmentMenuContent>;

export type StorefrontDepartmentOption = {
  id: string;
  label: string;
  href: string;
};

export function createStorefrontDepartmentOptions(
  categories: WebsiteCategory[]
): StorefrontDepartmentOption[] {
  return orderWebsiteCategories(categories)
    .filter((category) => category.parentId === null && category.visible)
    .map((category) => ({
      id: category.slug,
      label: category.name,
      href: storefrontDepartmentHref(category)
    }));
}

export function createStorefrontDepartmentMenus(
  categories: WebsiteCategory[]
): StorefrontDepartmentMenus {
  const ordered = orderWebsiteCategories(categories);
  const visible = ordered.filter((category) =>
    websiteCategoryPath(category, ordered).every((ancestor) => ancestor.visible)
  );
  const roots = visible.filter((category) => category.parentId === null);

  return Object.fromEntries(
    roots.flatMap((root) => {
      const directChildren = visible.filter((category) => category.parentId === root.id);
      if (directChildren.length === 0) return [];

      const items: DepartmentMenuItem[] = [];
      const groups: DepartmentMenuGroup[] = [];

      for (const child of directChildren) {
        const descendants = visible.filter((category) =>
          websiteCategoryPath(category, visible).some((ancestor) => ancestor.id === child.id) &&
          category.id !== child.id
        );

        if (descendants.length === 0) {
          items.push(toMenuItem(child, root));
          continue;
        }

        groups.push({
          href: `/categories/${child.slug}`,
          label: child.name,
          items: descendants.map((category) => toMenuItem(category, root))
        });
      }

      const basePath = storefrontDepartmentHref(root);
      return [[root.slug, {
        ariaLabel: `${root.name} categories`,
        shopAllHref: basePath,
        shopAllLabel: `Shop All ${root.name}`,
        ...(items.length > 0 ? { items } : {}),
        ...(groups.length > 0 ? { groups } : {})
      } satisfies DepartmentMenuContent]];
    })
  );
}

export function departmentMenuForNavigationLink(
  menus: StorefrontDepartmentMenus,
  link: { href: string; id: string }
) {
  const hrefSlug = link.href.split(/[?#]/, 1)[0]?.replace(/^\/+|\/+$/g, "");
  return menus[link.id] ?? (hrefSlug ? menus[hrefSlug] : undefined);
}

function toMenuItem(category: WebsiteCategory, root: WebsiteCategory): DepartmentMenuItem {
  return {
    href: categoryHref(category, root),
    label: category.name
  };
}

function categoryHref(category: WebsiteCategory, root: WebsiteCategory) {
  const basePath = storefrontDepartmentHref(root);
  const parameter = root.slug === "party-supplies"
    ? partyCategoryParameter(category)
    : "category";
  return `${basePath}?${parameter}=${encodeURIComponent(category.slug)}#catalog`;
}

function partyCategoryParameter(category: WebsiteCategory) {
  if (category.kind === "party-theme") return "theme";
  if (category.kind === "party-solid-color") return "color";
  if (category.kind === "party-product-type") return "type";
  return "category";
}

export function storefrontDepartmentHref(root: Pick<WebsiteCategory, "slug">) {
  return root.slug === "toys" || root.slug === "party-supplies" || root.slug === "balloons"
    ? `/${root.slug}`
    : `/categories/${root.slug}`;
}
