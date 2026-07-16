import { describe, expect, it } from "vitest";
import {
  BalloonDraftError,
  createPublicToken,
  hashPublicToken,
  InMemoryBalloonDraftRepository,
  type BalloonDraftInput
} from "@/server/balloons/balloon-draft-service";

function validDraftInput(): BalloonDraftInput {
  return {
    occasion: "Birthday",
    colors: ["Blue", "Gold"],
    addons: [],
    fulfillmentMode: "PICKUP",
    locationId: "store-3rd-avenue",
    requestedFor: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    customerContact: {
      name: "Test Customer",
      email: "customer@example.com",
      phone: "2125550100"
    },
    lines: [
      {
        componentKey: "bouquet",
        quantity: 2,
        configuration: { size: "medium" }
      }
    ]
  };
}

describe("balloon draft service", () => {
  it("creates unguessable public tokens and stores only a deterministic hash", () => {
    const token = createPublicToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashPublicToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPublicToken(token)).not.toContain(token);
  });

  it("requires a complete draft before submission", async () => {
    const repository = new InMemoryBalloonDraftRepository();
    const { token } = await repository.create();

    await expect(repository.submit(token)).rejects.toMatchObject({
      code: "BALLOON_DRAFT_INCOMPLETE",
      status: 422
    });
  });

  it("submits idempotently and locks the customer draft against later edits", async () => {
    const repository = new InMemoryBalloonDraftRepository();
    const { token } = await repository.create();
    await repository.save(token, validDraftInput());

    const submitted = await repository.submit(token);
    const replay = await repository.submit(token);

    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).not.toBeNull();
    expect(replay).toEqual(submitted);
    await expect(repository.save(token, validDraftInput())).rejects.toBeInstanceOf(BalloonDraftError);
    await expect(repository.save(token, validDraftInput())).rejects.toMatchObject({
      code: "BALLOON_DRAFT_LOCKED",
      status: 409
    });
  });

  it("rejects local delivery drafts without an address at the repository boundary", async () => {
    const repository = new InMemoryBalloonDraftRepository();
    const { token } = await repository.create();
    const invalid = { ...validDraftInput(), fulfillmentMode: "LOCAL_DELIVERY" as const };

    await expect(repository.save(token, invalid)).rejects.toMatchObject({
      code: "BALLOON_DRAFT_INVALID",
      status: 422
    });
  });
});
