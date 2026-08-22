/**
 * Verifies fail-closed reconciliation of final Square tax totals.
 */

import { describe, expect, it, vi } from "vitest";
import type * as Square from "square";
import {
  reconcileSquareOrderTax,
  SquareTaxReconciliationError,
  type SquareTaxReconciliationErrorCode
} from "@/server/tax/square-tax-reconciliation";

function usd(amount: bigint): Square.Money {
  return { amount, currency: "USD" };
}

function finalOrder(): Square.Order {
  return {
    id: "square-order-secret-123",
    locationId: "square-location-1",
    lineItems: [{
      uid: "line-1",
      quantity: "2",
      name: "Customer product name",
      grossSalesMoney: usd(2_598n),
      totalDiscountMoney: usd(100n),
      totalTaxMoney: usd(231n),
      appliedTaxes: [{ taxUid: "merchandise-tax", appliedMoney: usd(231n) }]
    }],
    serviceCharges: [{
      uid: "shipping-charge",
      name: "USPS Ground Advantage",
      appliedMoney: usd(558n),
      totalTaxMoney: usd(50n),
      appliedTaxes: [{ taxUid: "shipping-tax", appliedMoney: usd(50n) }],
      metadata: { tax_component: "shipping", shippo_rate_id: "private-rate-id" }
    }],
    taxes: [{
      uid: "merchandise-tax",
      appliedMoney: usd(231n),
      metadata: { tax_component: "merchandise" }
    }, {
      uid: "shipping-tax",
      appliedMoney: usd(50n),
      metadata: { tax_component: "shipping" }
    }],
    totalDiscountMoney: usd(100n),
    totalTaxMoney: usd(281n),
    totalMoney: usd(3_337n),
    fulfillments: [{
      uid: "fulfillment-1",
      type: "SHIPMENT",
      state: "PROPOSED",
      shipmentDetails: {
        recipient: {
          displayName: "Private Customer",
          emailAddress: "private@example.com",
          address: { addressLine1: "123 Private Street" }
        }
      }
    }]
  };
}

function expectCode(run: () => unknown, code: SquareTaxReconciliationErrorCode) {
  try {
    run();
    throw new Error("Expected reconciliation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SquareTaxReconciliationError);
    expect((error as SquareTaxReconciliationError).code).toBe(code);
  }
}

describe("Square final-order tax reconciliation", () => {
  it("extracts a PII-free, serializable merchandise and shipping tax snapshot", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const snapshot = reconcileSquareOrderTax(finalOrder(), { hasNexus: true });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      currency: "USD",
      hasNexus: true,
      merchandiseSubtotalCents: 2_598,
      discountCents: 100,
      shippingCents: 558,
      merchandiseTaxCents: 231,
      shippingTaxCents: 50,
      unassignedTaxCents: 0,
      totalTaxCents: 281,
      totalCents: 3_337
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("Private Customer");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("123 Private Street");
    expect(serialized).not.toContain("square-order-secret-123");
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("supports a no-nexus order with exactly zero tax", () => {
    const order = finalOrder();
    order.lineItems![0].totalTaxMoney = usd(0n);
    order.lineItems![0].appliedTaxes = [];
    order.serviceCharges![0].totalTaxMoney = usd(0n);
    order.serviceCharges![0].appliedTaxes = [];
    order.taxes = [];
    order.totalTaxMoney = usd(0n);
    order.totalMoney = usd(3_056n);

    expect(reconcileSquareOrderTax(order, { hasNexus: false })).toMatchObject({
      hasNexus: false,
      merchandiseTaxCents: 0,
      shippingTaxCents: 0,
      totalTaxCents: 0,
      totalCents: 3_056
    });
  });

  it("uses tax_component metadata to select shipping among several service charges", () => {
    const order = finalOrder();
    order.serviceCharges = [{
      uid: "unrelated-zero-charge",
      appliedMoney: usd(0n),
      totalTaxMoney: usd(0n)
    }, ...order.serviceCharges!];

    expect(reconcileSquareOrderTax(order, { hasNexus: true }).shippingCents).toBe(558);
  });

  it("falls back to the only service charge when legacy metadata is absent", () => {
    const order = finalOrder();
    order.serviceCharges![0].metadata = undefined;
    order.taxes![1].metadata = undefined;

    expect(reconcileSquareOrderTax(order, { hasNexus: true })).toMatchObject({
      shippingCents: 558,
      shippingTaxCents: 50
    });
  });

  it("detects tax that is not assigned to merchandise or shipping", () => {
    const order = finalOrder();
    order.taxes!.push({
      uid: "unassigned-tax",
      appliedMoney: usd(19n)
    });
    order.totalTaxMoney = usd(300n);
    order.totalMoney = usd(3_356n);

    expectCode(
      () => reconcileSquareOrderTax(order, { hasNexus: true }),
      "UNASSIGNED_TAX"
    );
  });

  it("rejects nonzero tax when the persisted decision says there is no nexus", () => {
    expectCode(
      () => reconcileSquareOrderTax(finalOrder(), { hasNexus: false }),
      "NEXUS_TAX_MISMATCH"
    );
  });

  it("rejects a shipping tax tag that disagrees with the shipping charge", () => {
    const order = finalOrder();
    order.taxes![1].appliedMoney = usd(49n);
    order.taxes![0].appliedMoney = usd(232n);

    expectCode(
      () => reconcileSquareOrderTax(order, { hasNexus: true }),
      "SHIPPING_TAX_METADATA_MISMATCH"
    );
  });

  it("rejects any extracted money that is not USD", () => {
    const order = finalOrder();
    order.serviceCharges![0].appliedMoney = { amount: 558n, currency: "CAD" };

    expectCode(
      () => reconcileSquareOrderTax(order, { hasNexus: true }),
      "NON_USD_MONEY"
    );
  });

  it("rejects bigint amounts that cannot be represented safely", () => {
    const order = finalOrder();
    order.lineItems![0].grossSalesMoney = usd(BigInt(Number.MAX_SAFE_INTEGER) + 1n);

    expectCode(
      () => reconcileSquareOrderTax(order, { hasNexus: true }),
      "INVALID_MONEY"
    );
  });

  it("rejects ambiguous shipping service charges without an identity marker", () => {
    const order = finalOrder();
    order.serviceCharges = [{
      uid: "charge-1",
      appliedMoney: usd(279n),
      totalTaxMoney: usd(25n)
    }, {
      uid: "charge-2",
      appliedMoney: usd(279n),
      totalTaxMoney: usd(25n)
    }];
    order.taxes![1].metadata = undefined;

    expectCode(
      () => reconcileSquareOrderTax(order, { hasNexus: true }),
      "AMBIGUOUS_SHIPPING_SERVICE_CHARGE"
    );
  });
});
