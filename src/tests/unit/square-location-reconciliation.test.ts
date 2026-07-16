import { describe, expect, it } from "vitest";
import { rankSquareLocationCandidates } from "@/server/square/location-reconciliation";

describe("Square location reconciliation", () => {
  it("ranks exact phone, postal code, and street number without guessing on weak names", () => {
    const candidates = rankSquareLocationCandidates(
      {
        id: "store-3rd-avenue",
        name: "3rd Avenue Store",
        address: "1243 3rd Ave., New York, NY 10021",
        phone: "212-879-8076",
        squareLocationId: null
      },
      [
        {
          id: "square-good",
          name: "State News 3rd Ave",
          status: "ACTIVE",
          type: "PHYSICAL",
          phone: "+1 212-879-8076",
          addressLine1: "1243 Third Avenue",
          locality: "New York",
          administrativeDistrict: "NY",
          postalCode: "10021"
        },
        {
          id: "square-weak",
          name: "3rd Avenue Store",
          status: "ACTIVE",
          type: "PHYSICAL",
          phone: null,
          addressLine1: null,
          locality: null,
          administrativeDistrict: null,
          postalCode: null
        }
      ]
    );

    expect(candidates[0]).toMatchObject({
      squareLocation: { id: "square-good" },
      score: 12,
      reasons: ["phone", "postal-code", "street-number"]
    });
    expect(candidates[1]).toMatchObject({ squareLocation: { id: "square-weak" }, score: 2 });
  });
});
