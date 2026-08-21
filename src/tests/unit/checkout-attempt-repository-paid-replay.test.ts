/** Verifies that completed split checkout evidence remains readable only for paid-webhook replay. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({
    checkoutAttempt: { findFirst: mocks.findFirst }
  })
}));

vi.mock("@/server/db/persistence-policy", () => ({
  PersistenceUnavailableError: class PersistenceUnavailableError extends Error {},
  requireDatabaseOrDevelopmentFallback: () => "database"
}));

import { getCheckoutAttemptRepository } from "@/server/checkout/checkout-attempt-repository";

const completedSplitCheckout = {
  id: "checkout-attempt-completed-1",
  requestHash: "request-hash",
  quote: { lines: [] },
  expiresAt: new Date("2026-08-21T04:34:37.535Z"),
  checkoutVersion: 2,
  splitCheckoutContext: { schemaVersion: "storefront.split-checkout.v2", groups: [] },
  squareOrderId: "square-order-1",
  squarePaymentLinkId: "square-link-1",
  squareCheckoutUrl: "https://sandbox.square.link/u/replay"
};

describe("paid split checkout replay correlation", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.findFirst.mockResolvedValue(completedSplitCheckout);
  });

  it("allows completed evidence for a paid-webhook replay", async () => {
    const repository = getCheckoutAttemptRepository();

    await expect(repository.findSplitCheckout(completedSplitCheckout.id, {
      allowCompletedReplay: true
    })).resolves.toMatchObject({
      attemptId: completedSplitCheckout.id,
      squareOrderId: completedSplitCheckout.squareOrderId
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: completedSplitCheckout.id,
        status: { in: ["VALIDATED", "COMPLETED"] }
      }
    });
  });

  it("keeps ordinary checkout replay limited to unpaid validated attempts", async () => {
    const repository = getCheckoutAttemptRepository();

    await repository.findSplitCheckout(completedSplitCheckout.id);

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: completedSplitCheckout.id, status: "VALIDATED" }
    });
  });
});
