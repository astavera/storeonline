"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const routeLabels: Record<string, string> = {
  about: "About Us",
  "arts-and-crafts": "Arts & Crafts",
  balloons: "Balloons",
  bouquets: "Bouquets",
  contact: "Contact",
  gifts: "Gifts",
  "greeting-cards": "Greeting Cards",
  holidays: "Holidays",
  latex: "Latex Balloons",
  "local-delivery": "Local Delivery",
  "local-delivery-policy": "Local Delivery Policy",
  locations: "Locations",
  mylar: "Mylar Balloons",
  "numbers-letters": "Numbers & Letters",
  "nyc-balloon-delivery": "NYC Balloon Delivery",
  "party-supplies": "Party Supplies",
  pickup: "Pickup",
  "pickup-policy": "Pickup Policy",
  "privacy-policy": "Privacy Policy",
  "return-policy": "Return Policy",
  returns: "Returns",
  search: "Search",
  security: "Security",
  "shipping-policy": "Shipping Policy",
  shop: "Shop",
  stationery: "Stationery",
  terms: "Terms",
  toys: "Toys",
  "3rd-avenue": "3rd Avenue",
  "86th-street": "86th Street",
  "upper-east-side-arts-and-crafts": "Upper East Side Arts & Crafts",
  "upper-east-side-balloons": "Upper East Side Balloons",
  "upper-east-side-gifts": "Upper East Side Gifts",
  "upper-east-side-greeting-cards": "Upper East Side Greeting Cards",
  "upper-east-side-party-supplies": "Upper East Side Party Supplies",
  "upper-east-side-stationery": "Upper East Side Stationery",
  "upper-east-side-toy-store": "Upper East Side Toy Store"
};

type RouteCrumb = {
  href?: string;
  label: string;
};

export function StorefrontRouteMap() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  const crumbs = createRouteCrumbs(pathname);

  return (
    <div className="border-b border-border bg-white" data-store-component="StorefrontRouteMap">
      <div className="flex min-h-12 w-full items-center px-3 py-2 sm:px-5">
        <nav aria-label="Breadcrumb" className="min-w-0 overflow-x-auto">
          <ol className="flex min-w-max items-center text-xs font-bold text-secondary sm:text-sm">
            {crumbs.map((crumb, index) => {
              const isCurrent = index === crumbs.length - 1;

              return (
                <li className="flex items-center" key={`${crumb.label}-${index}`}>
                  {index > 0 ? <ChevronRight aria-hidden="true" className="mx-1.5 text-secondary/60" size={14} /> : null}
                  {isCurrent || !crumb.href ? (
                    <span aria-current={isCurrent ? "page" : undefined} className={isCurrent ? "text-primary" : undefined}>
                      {crumb.label}
                    </span>
                  ) : (
                    <Link className="transition hover:text-primary hover:underline" href={crumb.href}>
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

function createRouteCrumbs(pathname: string): RouteCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: RouteCrumb[] = [{ href: "/", label: "Home" }];

  if (segments[0] === "products" || segments[0] === "categories") {
    crumbs.push({ href: "/shop", label: "Shop" });
    if (segments[1]) {
      crumbs.push({ label: labelForSegment(segments[1]) });
    }
    return crumbs;
  }

  segments.forEach((segment, index) => {
    const isCurrent = index === segments.length - 1;
    crumbs.push({
      href: isCurrent ? undefined : `/${segments.slice(0, index + 1).join("/")}`,
      label: labelForSegment(segment)
    });
  });

  return crumbs;
}

function labelForSegment(segment: string) {
  if (routeLabels[segment]) {
    return routeLabels[segment];
  }

  let decodedSegment = segment;
  try {
    decodedSegment = decodeURIComponent(segment);
  } catch {
    decodedSegment = segment;
  }

  return decodedSegment
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
