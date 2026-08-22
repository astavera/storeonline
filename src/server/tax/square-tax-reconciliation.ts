/**
 * Produces a PII-free, JSON-serializable tax snapshot from a final Square order.
 *
 * This module is intentionally pure: it performs no I/O and never logs the order.
 */

import type * as Square from "square";

export const SQUARE_TAX_RECONCILIATION_SCHEMA_VERSION = 1 as const;

export type SquareTaxReconciliationErrorCode =
  | "INVALID_CONTEXT"
  | "MISSING_MONEY"
  | "NON_USD_MONEY"
  | "INVALID_MONEY"
  | "AMBIGUOUS_SHIPPING_SERVICE_CHARGE"
  | "NEXUS_TAX_MISMATCH"
  | "UNASSIGNED_TAX"
  | "TAX_BREAKDOWN_MISMATCH"
  | "TAX_ROLLUP_MISMATCH"
  | "SHIPPING_TAX_METADATA_MISMATCH"
  | "ORDER_TOTAL_MISMATCH";

export class SquareTaxReconciliationError extends Error {
  readonly code: SquareTaxReconciliationErrorCode;

  constructor(code: SquareTaxReconciliationErrorCode) {
    super(`Square tax reconciliation failed (${code}).`);
    this.name = "SquareTaxReconciliationError";
    this.code = code;
  }
}

export type SquareTaxReconciliationOptions = Readonly<{
  /** The persisted provider nexus decision associated with this final order. */
  hasNexus: boolean;
}>;

export type SquareTaxReconciliationSnapshot = Readonly<{
  schemaVersion: typeof SQUARE_TAX_RECONCILIATION_SCHEMA_VERSION;
  currency: "USD";
  hasNexus: boolean;
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  unassignedTaxCents: 0;
  totalTaxCents: number;
  totalCents: number;
}>;

/**
 * Reconciles a fully hydrated, final Square Order.
 *
 * Merchandise tax is sourced from line-item rollups and shipping tax from the
 * identified shipping service charge. `tax_component=shipping` is the primary
 * identity marker. A single service charge is a safe fallback for older orders.
 */
export function reconcileSquareOrderTax(
  order: Square.Order,
  options: SquareTaxReconciliationOptions
): SquareTaxReconciliationSnapshot {
  if (!order || typeof order !== "object" || typeof options?.hasNexus !== "boolean") {
    throw new SquareTaxReconciliationError("INVALID_CONTEXT");
  }

  const lineItems = order.lineItems ?? [];
  const serviceCharges = order.serviceCharges ?? [];
  const taxes = order.taxes ?? [];
  const shippingServiceChargeIndex = resolveShippingServiceChargeIndex(serviceCharges, taxes);

  const merchandiseSubtotalCents = sumCents(
    lineItems.map((line) => readRequiredUsdMoney(line.grossSalesMoney))
  );
  const discountCents = readOptionalUsdMoney(order.totalDiscountMoney);
  const merchandiseTaxCents = sumCents(
    lineItems.map((line) => readOptionalUsdMoney(line.totalTaxMoney))
  );

  const shippingServiceCharge = shippingServiceChargeIndex === null
    ? null
    : serviceCharges[shippingServiceChargeIndex];
  const shippingCents = shippingServiceCharge
    ? readRequiredUsdMoney(shippingServiceCharge.appliedMoney)
    : 0;
  const shippingTaxCents = shippingServiceCharge
    ? readOptionalUsdMoney(shippingServiceCharge.totalTaxMoney)
    : 0;

  const otherServiceChargeTaxCents = sumCents(
    serviceCharges
      .filter((_, index) => index !== shippingServiceChargeIndex)
      .map((serviceCharge) => readOptionalUsdMoney(serviceCharge.totalTaxMoney))
  );
  const totalTaxCents = readRequiredUsdMoney(order.totalTaxMoney);
  const totalCents = readRequiredUsdMoney(order.totalMoney);

  if (!options.hasNexus && totalTaxCents !== 0) {
    throw new SquareTaxReconciliationError("NEXUS_TAX_MISMATCH");
  }

  const assignedTaxCents = sumCents([merchandiseTaxCents, shippingTaxCents]);
  if (assignedTaxCents < totalTaxCents || otherServiceChargeTaxCents > 0) {
    throw new SquareTaxReconciliationError("UNASSIGNED_TAX");
  }
  if (assignedTaxCents !== totalTaxCents) {
    throw new SquareTaxReconciliationError("TAX_BREAKDOWN_MISMATCH");
  }

  const topLevelTaxCents = sumCents(
    taxes.map((tax) => readOptionalUsdMoney(tax.appliedMoney))
  );
  if (topLevelTaxCents !== totalTaxCents) {
    throw new SquareTaxReconciliationError("TAX_ROLLUP_MISMATCH");
  }

  const shippingTaggedTaxes = taxes.filter(
    (tax) => readTaxComponent(tax.metadata) === "shipping"
  );
  if (shippingTaggedTaxes.length > 0) {
    const taggedShippingTaxCents = sumCents(
      shippingTaggedTaxes.map((tax) => readOptionalUsdMoney(tax.appliedMoney))
    );
    if (taggedShippingTaxCents !== shippingTaxCents) {
      throw new SquareTaxReconciliationError("SHIPPING_TAX_METADATA_MISMATCH");
    }
  }

  const expectedTotal = BigInt(merchandiseSubtotalCents)
    - BigInt(discountCents)
    + BigInt(shippingCents)
    + BigInt(totalTaxCents);
  if (expectedTotal < 0n || expectedTotal !== BigInt(totalCents)) {
    throw new SquareTaxReconciliationError("ORDER_TOTAL_MISMATCH");
  }

  return Object.freeze({
    schemaVersion: SQUARE_TAX_RECONCILIATION_SCHEMA_VERSION,
    currency: "USD",
    hasNexus: options.hasNexus,
    merchandiseSubtotalCents,
    discountCents,
    shippingCents,
    merchandiseTaxCents,
    shippingTaxCents,
    unassignedTaxCents: 0,
    totalTaxCents,
    totalCents
  });
}

function resolveShippingServiceChargeIndex(
  serviceCharges: readonly Square.OrderServiceCharge[],
  taxes: readonly Square.OrderLineItemTax[]
) {
  if (serviceCharges.length === 0) return null;

  const metadataMatches = matchingIndexes(
    serviceCharges,
    (serviceCharge) => readTaxComponent(serviceCharge.metadata) === "shipping"
  );
  if (metadataMatches.length > 1) {
    throw new SquareTaxReconciliationError("AMBIGUOUS_SHIPPING_SERVICE_CHARGE");
  }
  if (metadataMatches.length === 1) return metadataMatches[0];

  const shippingTaxUids = new Set(
    taxes.flatMap((tax) =>
      readTaxComponent(tax.metadata) === "shipping" && tax.uid ? [tax.uid] : []
    )
  );
  const appliedTaxMatches = matchingIndexes(
    serviceCharges,
    (serviceCharge) => (serviceCharge.appliedTaxes ?? []).some(
      (appliedTax) => shippingTaxUids.has(appliedTax.taxUid)
    )
  );
  if (appliedTaxMatches.length > 1) {
    throw new SquareTaxReconciliationError("AMBIGUOUS_SHIPPING_SERVICE_CHARGE");
  }
  if (appliedTaxMatches.length === 1) return appliedTaxMatches[0];

  const stableUidMatches = matchingIndexes(
    serviceCharges,
    (serviceCharge) => serviceCharge.uid === "verified-shipping-service-charge"
  );
  if (stableUidMatches.length > 1) {
    throw new SquareTaxReconciliationError("AMBIGUOUS_SHIPPING_SERVICE_CHARGE");
  }
  if (stableUidMatches.length === 1) return stableUidMatches[0];

  if (serviceCharges.length === 1) return 0;
  throw new SquareTaxReconciliationError("AMBIGUOUS_SHIPPING_SERVICE_CHARGE");
}

function matchingIndexes<T>(values: readonly T[], predicate: (value: T) => boolean) {
  const indexes: number[] = [];
  values.forEach((value, index) => {
    if (predicate(value)) indexes.push(index);
  });
  return indexes;
}

function readTaxComponent(metadata: Record<string, string | null> | null | undefined) {
  return metadata?.tax_component?.trim().toLowerCase() ?? null;
}

function readRequiredUsdMoney(money: Square.Money | null | undefined) {
  if (!money || money.amount === undefined) {
    throw new SquareTaxReconciliationError("MISSING_MONEY");
  }
  return readUsdAmount(money);
}

function readOptionalUsdMoney(money: Square.Money | null | undefined) {
  if (!money) return 0;
  if (money.amount === undefined) {
    throw new SquareTaxReconciliationError("MISSING_MONEY");
  }
  return readUsdAmount(money);
}

function readUsdAmount(money: Square.Money) {
  if (money.currency !== "USD") {
    throw new SquareTaxReconciliationError("NON_USD_MONEY");
  }
  if (typeof money.amount !== "bigint" || money.amount < 0n) {
    throw new SquareTaxReconciliationError("INVALID_MONEY");
  }
  if (money.amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SquareTaxReconciliationError("INVALID_MONEY");
  }
  return Number(money.amount);
}

function sumCents(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SquareTaxReconciliationError("INVALID_MONEY");
  }
  return Number(total);
}
