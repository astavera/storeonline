export const squareCspOrigins = [
  "https://web.squarecdn.com",
  "https://sandbox.web.squarecdn.com",
  "https://connect.squareup.com",
  "https://connect.squareupsandbox.com"
] as const;

export const sensitiveLogKeys = [
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
  "paymentToken",
  "sourceId",
  "card",
  "authorization"
] as const;
