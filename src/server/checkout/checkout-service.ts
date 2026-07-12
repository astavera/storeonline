import "server-only";
import { z } from "zod";
import { assertSquareWriteAllowed } from "@/server/square/client";

export const checkoutIntentSchema = z.object({
  cartId: z.string().min(1),
  fulfillmentGroupId: z.string().min(1),
  squarePaymentToken: z.string().min(1)
});

export async function createCheckoutIntent(input: z.infer<typeof checkoutIntentSchema>) {
  const parsed = checkoutIntentSchema.parse(input);
  assertSquareWriteAllowed();

  return {
    checkoutIntentId: `checkout_${parsed.cartId}`,
    status: "validated"
  };
}
