/**
 * Provides new york delivery date utilities for the fulfillment feature.
 */

const newYorkTimeZone = "America/New_York";

export function currentNewYorkDate(now = new Date()) {
  return newYorkDateAfterDays(0, now);
}

export function earliestNewYorkDeliveryDate(now = new Date()) {
  return newYorkDateAfterDays(1, now);
}

export function latestNewYorkDeliveryDate(now = new Date()) {
  return newYorkDateAfterDays(90, now);
}

export function isWithinNewYorkDeliveryWindow(value: string, now = new Date()) {
  return value >= earliestNewYorkDeliveryDate(now) && value <= latestNewYorkDeliveryDate(now);
}

export function newYorkUtcOffsetForDate(value: string) {
  const probe = new Date(`${value}T12:00:00Z`);
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: newYorkTimeZone,
    timeZoneName: "longOffset"
  }).formatToParts(probe).find((part) => part.type === "timeZoneName")?.value;
  const match = offsetName ? /^GMT([+-]\d{2}:\d{2})$/.exec(offsetName) : null;

  if (!match) {
    throw new Error(`Unable to determine the New York UTC offset for ${value}.`);
  }

  return match[1];
}

function newYorkDateAfterDays(days: number, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: newYorkTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days));
  return date.toISOString().slice(0, 10);
}
