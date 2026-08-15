/** Shared, browser-safe customer account contracts. */

export const customerTermsVersion = "2026-08-04";
export const customerMarketingConsentVersion = "2026-08-04";

export type PublicCustomerAccount = {
  id: string;
  email: string;
  firstName: string | null;
  marketingEmailConsent: boolean;
};
