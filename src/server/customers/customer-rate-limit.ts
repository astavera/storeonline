/** Rate limits customer authentication without writing to production in preview mode. */

import "server-only";

import { getAdminRateLimiter, InMemoryAdminRateLimiter } from "@/server/admin/admin-rate-limit";
import { isCustomerAuthDevelopmentPreview } from "./customer-security";

const developmentLimiter = new InMemoryAdminRateLimiter();

export function getCustomerRateLimiter() {
  return isCustomerAuthDevelopmentPreview() ? developmentLimiter : getAdminRateLimiter();
}
