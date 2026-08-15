/**
 * Verifies the isolated behavior of slot occurrence generator.
 */

import { describe, expect, it, vi } from "vitest";
import {
  generateSlotOccurrences,
  InvalidSlotOccurrenceGenerationError,
  newYorkLocalDateTimeToUtc,
  type SlotOccurrenceClient
} from "@/server/fulfillment/slot-occurrence-generator";

describe("slot occurrence generator", () => {
  it("materializes matching New York calendar dates with a capacity snapshot", async () => {
    const templates = [{
      id: "template-monday",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:30",
      capacityPoints: 12
    }];
    const occurrences: Array<{
      id: string;
      slotTemplateId: string;
      startsAt: Date;
      endsAt: Date;
      capacityPoints: number;
      active: boolean;
    }> = [];
    const createMany = vi.fn(async (args: { data: Omit<(typeof occurrences)[number], "id">[]; skipDuplicates: boolean }) => {
      let count = 0;
      for (const candidate of args.data) {
        if (occurrences.some((record) => record.slotTemplateId === candidate.slotTemplateId
          && record.startsAt.getTime() === candidate.startsAt.getTime())) continue;
        occurrences.push({ ...candidate, id: `occurrence-${occurrences.length + 1}` });
        count += 1;
      }
      return { count };
    });
    const findMany = vi.fn().mockImplementation(async () => [...occurrences]);
    const client = {
      slotTemplate: { findMany: vi.fn().mockResolvedValue(templates) },
      slotOccurrence: { createMany, findMany }
    } as unknown as SlotOccurrenceClient;

    const first = await generateSlotOccurrences({
      fromDate: "2026-07-20",
      throughDate: "2026-07-21",
      locationId: "store-3rd-avenue",
      fulfillmentMode: "PICKUP"
    }, client);
    expect(first).toMatchObject({ candidateCount: 1, createdCount: 1 });
    expect(first.occurrences[0]).toMatchObject({
      startsAt: new Date("2026-07-20T13:00:00.000Z"),
      endsAt: new Date("2026-07-20T14:30:00.000Z"),
      capacityPoints: 12
    });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));

    templates[0].capacityPoints = 20;
    const replay = await generateSlotOccurrences({
      fromDate: "2026-07-20",
      throughDate: "2026-07-21"
    }, client);
    expect(replay.createdCount).toBe(0);
    expect(replay.occurrences[0].capacityPoints).toBe(12);
  });

  it("uses the seasonal New York offset and rejects a nonexistent DST time", () => {
    expect(newYorkLocalDateTimeToUtc("2026-01-12", "09:00"))
      .toEqual(new Date("2026-01-12T14:00:00.000Z"));
    expect(newYorkLocalDateTimeToUtc("2026-07-20", "09:00"))
      .toEqual(new Date("2026-07-20T13:00:00.000Z"));
    expect(() => newYorkLocalDateTimeToUtc("2026-03-08", "02:30"))
      .toThrow(InvalidSlotOccurrenceGenerationError);
  });

  it("returns an empty idempotent result when no templates match", async () => {
    const createMany = vi.fn();
    const client = {
      slotTemplate: { findMany: vi.fn().mockResolvedValue([]) },
      slotOccurrence: { createMany, findMany: vi.fn() }
    } as unknown as SlotOccurrenceClient;

    await expect(generateSlotOccurrences({
      fromDate: "2026-07-20",
      throughDate: "2026-07-20"
    }, client)).resolves.toEqual({ candidateCount: 0, createdCount: 0, occurrences: [] });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects reversed and unbounded generation windows", async () => {
    const client = {} as SlotOccurrenceClient;
    await expect(generateSlotOccurrences({
      fromDate: "2026-07-21",
      throughDate: "2026-07-20"
    }, client)).rejects.toBeInstanceOf(InvalidSlotOccurrenceGenerationError);
    await expect(generateSlotOccurrences({
      fromDate: "2026-01-01",
      throughDate: "2026-12-31"
    }, client)).rejects.toBeInstanceOf(InvalidSlotOccurrenceGenerationError);
  });
});
