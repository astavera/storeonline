/**
 * Implements server-side balloon draft service behavior and persistence boundaries.
 */

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(40)
});

const addressSchema = z.object({
  addressLine1: z.string().trim().min(1).max(160),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/)
});

const draftLineSchema = z.object({
  squareVariationId: z.string().trim().min(1).max(160).optional(),
  componentKey: z.enum(["latex", "mylar", "numbers-letters", "bouquet", "addon", "custom"]),
  quantity: z.number().int().min(1).max(100),
  configuration: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(100)).max(20)]))
});

export const balloonDraftInputSchema = z.object({
  occasion: z.string().trim().min(1).max(100),
  colors: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  addons: z.array(z.string().trim().min(1).max(80)).max(12),
  fulfillmentMode: z.enum(["PICKUP", "LOCAL_DELIVERY"]),
  locationId: z.string().trim().min(1).max(160),
  requestedFor: z.string().datetime({ offset: true }),
  customerContact: contactSchema,
  deliveryAddress: addressSchema.optional(),
  notes: z.string().trim().max(1_000).optional(),
  lines: z.array(draftLineSchema).min(1).max(100)
}).superRefine((value, context) => {
  if (value.fulfillmentMode === "LOCAL_DELIVERY" && !value.deliveryAddress) {
    context.addIssue({ code: "custom", message: "Delivery address is required for local delivery.", path: ["deliveryAddress"] });
  }
  const requestedFor = Date.parse(value.requestedFor);
  if (requestedFor < Date.now() + 60 * 60_000) {
    context.addIssue({ code: "custom", message: "Requested time must be at least one hour in the future.", path: ["requestedFor"] });
  }
  if (requestedFor > Date.now() + 366 * 24 * 60 * 60_000) {
    context.addIssue({ code: "custom", message: "Requested time must be within one year.", path: ["requestedFor"] });
  }
});

export type BalloonDraftInput = z.infer<typeof balloonDraftInputSchema>;

export type BalloonDraftView = {
  id: string;
  status: "DRAFT" | "SUBMITTED" | "QUOTED" | "EXPIRED" | "CONVERTED" | "CANCELLED";
  expiresAt: string;
  submittedAt: string | null;
  input: BalloonDraftInput | null;
  latestQuote: { subtotalCents: number; feeCents: number; taxCents: number; totalCents: number; currency: string; expiresAt: string } | null;
};

export type BalloonDraftCreation = { token: string; draft: BalloonDraftView };

export interface BalloonDraftRepository {
  create(): Promise<BalloonDraftCreation>;
  read(token: string): Promise<BalloonDraftView>;
  save(token: string, input: BalloonDraftInput): Promise<BalloonDraftView>;
  submit(token: string): Promise<BalloonDraftView>;
}

export class BalloonDraftError extends Error {
  constructor(public readonly code: string, public readonly status: 404 | 409 | 410 | 422, message: string) {
    super(message);
    this.name = "BalloonDraftError";
  }
}

type MemoryDraft = BalloonDraftView;

export class InMemoryBalloonDraftRepository implements BalloonDraftRepository {
  private readonly drafts = new Map<string, MemoryDraft>();

  async create() {
    const token = createPublicToken();
    const draft: BalloonDraftView = {
      id: `development-${this.drafts.size + 1}`,
      status: "DRAFT",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      submittedAt: null,
      input: null,
      latestQuote: null
    };
    this.drafts.set(hashPublicToken(token), draft);
    return { token, draft };
  }

  async read(token: string) {
    return structuredClone(this.requireDraft(token));
  }

  async save(token: string, input: BalloonDraftInput) {
    const current = this.requireDraft(token);
    assertEditableDraft(current);
    const validatedInput = parseDraftInput(input);
    const next = { ...current, input: structuredClone(validatedInput), status: "DRAFT" as const, submittedAt: null, latestQuote: null };
    this.drafts.set(hashPublicToken(token), next);
    return structuredClone(next);
  }

  async submit(token: string) {
    const current = this.requireDraft(token);
    if (current.status === "SUBMITTED") return structuredClone(current);
    assertEditableDraft(current);
    if (!current.input) throw new BalloonDraftError("BALLOON_DRAFT_INCOMPLETE", 422, "Complete the balloon request before submitting it.");
    const next = { ...current, status: "SUBMITTED" as const, submittedAt: new Date().toISOString() };
    this.drafts.set(hashPublicToken(token), next);
    return structuredClone(next);
  }

  private requireDraft(token: string) {
    const draft = this.drafts.get(hashPublicToken(token));
    if (!draft) throw new BalloonDraftError("BALLOON_DRAFT_NOT_FOUND", 404, "Balloon request was not found.");
    if (Date.parse(draft.expiresAt) <= Date.now()) throw new BalloonDraftError("BALLOON_DRAFT_EXPIRED", 410, "Balloon request has expired.");
    return draft;
  }
}

const developmentRepository = new InMemoryBalloonDraftRepository();

export function getBalloonDraftRepository(): BalloonDraftRepository {
  return requireDatabaseOrDevelopmentFallback("Balloon order drafts") === "database" ? prismaRepository : developmentRepository;
}

export function createPublicToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPublicToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const prismaRepository: BalloonDraftRepository = {
  async create() {
    const token = createPublicToken();
    try {
      const draft = await getPrismaClient().balloonOrderDraft.create({
        data: { publicTokenHash: hashPublicToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) },
        include: draftInclude
      });
      return { token, draft: toDraftView(draft) };
    } catch (error) {
      throw new PersistenceUnavailableError("Balloon order drafts", { cause: error });
    }
  },

  async read(token) {
    try {
      return toDraftView(await findDraft(token));
    } catch (error) {
      rethrowDraftPersistence(error);
    }
  },

  async save(token, input) {
    try {
      const validatedInput = parseDraftInput(input);
      const tokenHash = hashPublicToken(token);
      await getPrismaClient().$transaction(async (transaction) => {
        const current = await transaction.balloonOrderDraft.findUnique({ where: { publicTokenHash: tokenHash } });
        assertEditableDraft(current);
        const location = await transaction.storeLocation.findUnique({
          where: { id: validatedInput.locationId },
          select: { pickupEnabled: true, localDeliveryEnabled: true }
        });
        if (!location) throw new BalloonDraftError("BALLOON_LOCATION_INVALID", 422, "Selected pickup location is unavailable.");
        if (validatedInput.fulfillmentMode === "PICKUP" && !location.pickupEnabled) {
          throw new BalloonDraftError("BALLOON_FULFILLMENT_UNAVAILABLE", 422, "Pickup is unavailable at the selected location.");
        }
        if (validatedInput.fulfillmentMode === "LOCAL_DELIVERY" && !location.localDeliveryEnabled) {
          throw new BalloonDraftError("BALLOON_FULFILLMENT_UNAVAILABLE", 422, "Local delivery is unavailable at the selected location.");
        }
        const variationIds = validatedInput.lines.map((line) => line.squareVariationId).filter((id): id is string => Boolean(id));
        if (variationIds.length > 0) {
          const variations = await transaction.squareItemVariation.count({ where: { id: { in: variationIds }, deletedAt: null } });
          if (variations !== new Set(variationIds).size) throw new BalloonDraftError("BALLOON_VARIATION_INVALID", 422, "One or more balloon selections are unavailable.");
        }
        await transaction.balloonDraftLine.deleteMany({ where: { draftId: current!.id } });
        await transaction.balloonDraftLine.createMany({
          data: validatedInput.lines.map((line, index) => ({
            draftId: current!.id,
            squareVariationId: line.squareVariationId,
            componentKey: line.componentKey,
            quantity: line.quantity,
            configuration: toPrismaJson(line.configuration),
            capacityPoints: capacityPoints(line.componentKey, line.quantity),
            sortOrder: index
          }))
        });
        await transaction.balloonQuote.updateMany({ where: { draftId: current!.id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
        await transaction.balloonOrderDraft.update({
          where: { id: current!.id },
          data: {
            status: "DRAFT",
            submittedAt: null,
            locationId: validatedInput.locationId,
            fulfillmentMode: validatedInput.fulfillmentMode,
            requestDetails: toPrismaJson({
              occasion: validatedInput.occasion,
              colors: validatedInput.colors,
              addons: validatedInput.addons,
              ...(validatedInput.notes ? { notes: validatedInput.notes } : {})
            }),
            customerContact: toPrismaJson(validatedInput.customerContact),
            deliveryAddress: validatedInput.deliveryAddress ? toPrismaJson(validatedInput.deliveryAddress) : Prisma.DbNull,
            requestedFor: new Date(validatedInput.requestedFor),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000)
          }
        });
      }, { isolationLevel: "Serializable" });
      return toDraftView(await findDraft(token));
    } catch (error) {
      rethrowDraftPersistence(error);
    }
  },

  async submit(token) {
    try {
      const tokenHash = hashPublicToken(token);
      await getPrismaClient().$transaction(async (transaction) => {
        const current = await transaction.balloonOrderDraft.findUnique({
          where: { publicTokenHash: tokenHash },
          include: { lines: { select: { id: true } } }
        });
        assertReadableDraft(current);
        if (current!.status === "SUBMITTED") return;
        assertEditableDraft(current);
        if (current!.lines.length === 0 || !current!.customerContact || !current!.locationId || !current!.requestedFor || !current!.fulfillmentMode) {
          throw new BalloonDraftError("BALLOON_DRAFT_INCOMPLETE", 422, "Complete the balloon request before submitting it.");
        }
        const result = await transaction.balloonOrderDraft.updateMany({
          where: { id: current!.id, status: "DRAFT" },
          data: { status: "SUBMITTED", submittedAt: new Date() }
        });
        if (result.count !== 1) throw new BalloonDraftError("BALLOON_DRAFT_CONFLICT", 409, "Balloon request changed while it was being submitted.");
      }, { isolationLevel: "Serializable" });
      return toDraftView(await findDraft(token));
    } catch (error) {
      rethrowDraftPersistence(error);
    }
  }
};

const draftInclude = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  quotes: { orderBy: { versionNumber: "desc" as const }, take: 1 }
};

async function findDraft(token: string) {
  const draft = await getPrismaClient().balloonOrderDraft.findUnique({ where: { publicTokenHash: hashPublicToken(token) }, include: draftInclude });
  if (!draft) throw new BalloonDraftError("BALLOON_DRAFT_NOT_FOUND", 404, "Balloon request was not found.");
  if (draft.expiresAt <= new Date()) throw new BalloonDraftError("BALLOON_DRAFT_EXPIRED", 410, "Balloon request has expired.");
  return draft;
}

function assertReadableDraft(draft: { expiresAt: Date; status: string } | null) {
  if (!draft) throw new BalloonDraftError("BALLOON_DRAFT_NOT_FOUND", 404, "Balloon request was not found.");
  if (draft.expiresAt <= new Date() || draft.status === "EXPIRED") throw new BalloonDraftError("BALLOON_DRAFT_EXPIRED", 410, "Balloon request has expired.");
}

function assertEditableDraft(draft: { expiresAt: Date | string; status: string } | null) {
  if (!draft) throw new BalloonDraftError("BALLOON_DRAFT_NOT_FOUND", 404, "Balloon request was not found.");
  const expiresAt = draft.expiresAt instanceof Date ? draft.expiresAt : new Date(draft.expiresAt);
  if (expiresAt <= new Date() || draft.status === "EXPIRED") throw new BalloonDraftError("BALLOON_DRAFT_EXPIRED", 410, "Balloon request has expired.");
  if (draft.status !== "DRAFT") throw new BalloonDraftError("BALLOON_DRAFT_LOCKED", 409, "Balloon request can no longer be edited.");
}

function toDraftView(draft: {
  id: string;
  status: BalloonDraftView["status"];
  expiresAt: Date;
  submittedAt: Date | null;
  locationId: string | null;
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING" | null;
  requestDetails: unknown;
  customerContact: unknown;
  deliveryAddress: unknown;
  requestedFor: Date | null;
  lines: Array<{ squareVariationId: string | null; componentKey: string; quantity: number; configuration: unknown }>;
  quotes: Array<{ subtotalCents: number; feeCents: number; taxCents: number; totalCents: number; currency: string; expiresAt: Date }>;
}): BalloonDraftView {
  const config = draft.requestDetails && typeof draft.requestDetails === "object" && !Array.isArray(draft.requestDetails) ? draft.requestDetails as Record<string, unknown> : {};
  const contact = draft.customerContact && typeof draft.customerContact === "object" && !Array.isArray(draft.customerContact) ? draft.customerContact : null;
  const address = draft.deliveryAddress && typeof draft.deliveryAddress === "object" && !Array.isArray(draft.deliveryAddress) ? draft.deliveryAddress : undefined;
  const input = draft.lines.length && draft.locationId && draft.fulfillmentMode && draft.requestedFor && contact
    ? balloonDraftInputSchema.parse({
        occasion: config.occasion,
        colors: config.colors,
        addons: config.addons,
        notes: config.notes,
        fulfillmentMode: draft.fulfillmentMode,
        locationId: draft.locationId,
        requestedFor: draft.requestedFor.toISOString(),
        customerContact: contact,
        deliveryAddress: address,
        lines: draft.lines.map((line) => ({
          ...(line.squareVariationId ? { squareVariationId: line.squareVariationId } : {}),
          componentKey: line.componentKey,
          quantity: line.quantity,
          configuration: line.configuration
        }))
      })
    : null;
  const quote = draft.quotes[0];
  return {
    id: draft.id,
    status: draft.status,
    expiresAt: draft.expiresAt.toISOString(),
    submittedAt: draft.submittedAt?.toISOString() ?? null,
    input,
    latestQuote: quote ? { ...quote, expiresAt: quote.expiresAt.toISOString() } : null
  };
}

function capacityPoints(componentKey: string, quantity: number) {
  const perUnit = componentKey === "bouquet" ? 3 : componentKey === "custom" ? 8 : 1;
  return perUnit * quantity;
}

function parseDraftInput(input: BalloonDraftInput) {
  const result = balloonDraftInputSchema.safeParse(input);
  if (!result.success) {
    throw new BalloonDraftError("BALLOON_DRAFT_INVALID", 422, "Balloon request contains invalid or incomplete information.");
  }
  return result.data;
}

function rethrowDraftPersistence(error: unknown): never {
  if (error instanceof BalloonDraftError) throw error;
  if (error instanceof PersistenceUnavailableError) throw error;
  throw new PersistenceUnavailableError("Balloon order drafts", { cause: error });
}
