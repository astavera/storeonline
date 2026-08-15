/**
 * Implements server-side slot occurrence generator behavior and persistence boundaries.
 */

import "server-only";

import type { FulfillmentMode } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

const newYorkTimeZone = "America/New_York";
const maximumGenerationDays = 93;

type SlotTemplateRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacityPoints: number;
};

type SlotOccurrenceRecord = {
  id: string;
  slotTemplateId: string;
  startsAt: Date;
  endsAt: Date;
  capacityPoints: number;
  active: boolean;
};

export type SlotOccurrenceClient = {
  slotTemplate: {
    findMany(args: unknown): Promise<SlotTemplateRecord[]>;
  };
  slotOccurrence: {
    createMany(args: unknown): Promise<{ count: number }>;
    findMany(args: unknown): Promise<SlotOccurrenceRecord[]>;
  };
};

export type GenerateSlotOccurrencesInput = {
  fromDate: string;
  throughDate: string;
  locationId?: string;
  fulfillmentMode?: FulfillmentMode;
};

export type SlotOccurrenceGenerationResult = {
  candidateCount: number;
  createdCount: number;
  occurrences: SlotOccurrenceRecord[];
};

export class InvalidSlotOccurrenceGenerationError extends Error {
  constructor() {
    super("The slot occurrence generation window is invalid.");
    this.name = "InvalidSlotOccurrenceGenerationError";
  }
}

export async function generateSlotOccurrences(
  input: GenerateSlotOccurrencesInput,
  client: SlotOccurrenceClient = getPrismaClient() as unknown as SlotOccurrenceClient
): Promise<SlotOccurrenceGenerationResult> {
  const dates = datesInRange(input.fromDate, input.throughDate);
  if (input.locationId !== undefined && input.locationId.length === 0) {
    throw new InvalidSlotOccurrenceGenerationError();
  }

  try {
    const templates = await client.slotTemplate.findMany({
      where: {
        active: true,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.fulfillmentMode ? { fulfillmentMode: input.fulfillmentMode } : {})
      },
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        capacityPoints: true
      }
    });

    const candidates = dates.flatMap((date) => templates
      .filter((template) => template.dayOfWeek === dayOfWeek(date))
      .map((template) => occurrenceCandidate(template, date)));
    if (candidates.length === 0) {
      return { candidateCount: 0, createdCount: 0, occurrences: [] };
    }

    const created = await client.slotOccurrence.createMany({ data: candidates, skipDuplicates: true });
    const storedOccurrences = await client.slotOccurrence.findMany({
      where: {
        slotTemplateId: { in: [...new Set(candidates.map((candidate) => candidate.slotTemplateId))] },
        startsAt: { in: candidates.map((candidate) => candidate.startsAt) }
      },
      orderBy: [{ startsAt: "asc" }, { slotTemplateId: "asc" }],
      select: {
        id: true,
        slotTemplateId: true,
        startsAt: true,
        endsAt: true,
        capacityPoints: true,
        active: true
      }
    });
    const candidateKeys = new Set(candidates.map((candidate) => occurrenceKey(candidate)));
    const occurrences = storedOccurrences.filter((occurrence) => candidateKeys.has(occurrenceKey(occurrence)));

    return { candidateCount: candidates.length, createdCount: created.count, occurrences };
  } catch (error) {
    if (error instanceof InvalidSlotOccurrenceGenerationError) throw error;
    throw new PersistenceUnavailableError("Slot occurrence", { cause: error });
  }
}

export function newYorkLocalDateTimeToUtc(date: string, time: string) {
  if (!isValidDateString(date) || !isValidTimeString(time)) {
    throw new InvalidSlotOccurrenceGenerationError();
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = dateTimeParts(new Date(candidate));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const adjustment = desiredAsUtc - actualAsUtc;
    if (adjustment === 0) break;
    candidate += adjustment;
  }

  const result = new Date(candidate);
  const finalParts = dateTimeParts(result);
  if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day
    || finalParts.hour !== hour || finalParts.minute !== minute) {
    throw new InvalidSlotOccurrenceGenerationError();
  }
  return result;
}

function occurrenceCandidate(template: SlotTemplateRecord, date: string) {
  if (!isValidTemplate(template)) throw new InvalidSlotOccurrenceGenerationError();
  return {
    slotTemplateId: template.id,
    startsAt: newYorkLocalDateTimeToUtc(date, template.startTime),
    endsAt: newYorkLocalDateTimeToUtc(date, template.endTime),
    capacityPoints: template.capacityPoints,
    active: true
  };
}

function occurrenceKey(value: { slotTemplateId: string; startsAt: Date }) {
  return `${value.slotTemplateId}\u0000${value.startsAt.toISOString()}`;
}

function datesInRange(fromDate: string, throughDate: string) {
  if (!isValidDateString(fromDate) || !isValidDateString(throughDate)) {
    throw new InvalidSlotOccurrenceGenerationError();
  }
  const start = Date.parse(`${fromDate}T00:00:00.000Z`);
  const end = Date.parse(`${throughDate}T00:00:00.000Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days < 1 || days > maximumGenerationDays) throw new InvalidSlotOccurrenceGenerationError();
  return Array.from({ length: days }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function dateTimeParts(value: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US-u-ca-iso8601", {
    timeZone: newYorkTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return parts as { year: number; month: number; day: number; hour: number; minute: number };
}

function isValidTemplate(template: SlotTemplateRecord) {
  return template.id.length > 0
    && Number.isInteger(template.dayOfWeek)
    && template.dayOfWeek >= 0
    && template.dayOfWeek <= 6
    && isValidTimeString(template.startTime)
    && isValidTimeString(template.endTime)
    && template.startTime < template.endTime
    && Number.isInteger(template.capacityPoints)
    && template.capacityPoints > 0;
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTimeString(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
