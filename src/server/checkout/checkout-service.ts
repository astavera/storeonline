import "server-only";
import { z } from "zod";

export const checkoutIntentSchema = z.object({
  cartId: z.string().min(1),
  fulfillmentGroupId: z.string().min(1)
});

export async function createCheckoutIntent(input: z.infer<typeof checkoutIntentSchema>) {
  const parsed = checkoutIntentSchema.parse(input);

  return {
    checkoutIntentId: `checkout_${parsed.cartId}`,
    fulfillmentGroupId: parsed.fulfillmentGroupId,
    status: "validation_only" as const,
    paymentCaptured: false,
    squareOrderCreated: false
  };
}
