/**
 * Defines the editable store administration defaults shared by Admin and the storefront.
 */

import { customerReturnPolicyText } from "@/features/returns/contracts";

export const policyIds = [
  "terms",
  "privacy",
  "returns",
  "shipping",
  "pickup",
  "local-delivery",
  "security"
] as const;

export type PolicyId = (typeof policyIds)[number];

export type StorePolicyDefinition = {
  id: PolicyId;
  label: string;
  route: string;
  defaultTitle: string;
  defaultBody: string;
  footerVisible: boolean;
};

export const storePolicyDefinitions: StorePolicyDefinition[] = [
  {
    id: "terms",
    label: "Terms & Conditions",
    route: "/terms",
    defaultTitle: "Terms & Conditions",
    defaultBody: "These terms govern purchases made through the Modern State online store. Product availability, fulfillment options, payment, cancellations, and customer responsibilities are confirmed during checkout.",
    footerVisible: true
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    route: "/privacy-policy",
    defaultTitle: "Privacy Policy",
    defaultBody: "Customer data, order data, and operational personal information are minimized, role-scoped, and protected by secure session controls.",
    footerVisible: true
  },
  {
    id: "returns",
    label: "Return Policy",
    route: "/return-policy",
    defaultTitle: "Return Policy",
    defaultBody: customerReturnPolicyText,
    footerVisible: true
  },
  {
    id: "shipping",
    label: "Shipping Policy",
    route: "/shipping-policy",
    defaultTitle: "Shipping Policy",
    defaultBody: "Shipping is available for eligible products. Available methods, timing, and cost are shown before purchase.",
    footerVisible: true
  },
  {
    id: "pickup",
    label: "Pickup Policy",
    route: "/pickup-policy",
    defaultTitle: "Pickup Policy",
    defaultBody: "Choose your preferred store and confirm item availability and an eligible pickup time during checkout.",
    footerVisible: true
  },
  {
    id: "local-delivery",
    label: "Local Delivery Policy",
    route: "/local-delivery-policy",
    defaultTitle: "Local Delivery Policy",
    defaultBody: "Local delivery availability, timing, and cost depend on the verified delivery address, service zone, and available delivery window.",
    footerVisible: true
  },
  {
    id: "security",
    label: "Security",
    route: "/security",
    defaultTitle: "Security",
    defaultBody: "Square payment tokens remain server-side. The storefront does not collect or store raw card data.",
    footerVisible: true
  }
];

export type StoreBusinessSettings = {
  storeName: string;
  legalName: string;
  supportEmail: string;
  supportPhone: string;
  storefrontTagline: string;
};

export type StoreTaxSettings = {
  calculationProvider: "square_catalog";
  estimateRatePercent: number;
  showEstimateInCart: boolean;
  effectiveAt: string;
};

export type StoreAdministrationSettings = {
  business: StoreBusinessSettings;
  tax: StoreTaxSettings;
  updatedAt: string;
};

export const defaultStoreAdministrationSettings: StoreAdministrationSettings = {
  business: {
    storeName: "Modern State - State News NYC",
    legalName: "Modern State",
    supportEmail: "",
    supportPhone: "212-879-8076",
    storefrontTagline: "Local, friendly, useful, and ready for modern ecommerce."
  },
  tax: {
    calculationProvider: "square_catalog",
    estimateRatePercent: 8.875,
    showEstimateInCart: true,
    effectiveAt: ""
  },
  updatedAt: ""
};

export function getStorePolicyDefinition(id: string) {
  return storePolicyDefinitions.find((policy) => policy.id === id);
}
