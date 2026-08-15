/** Sends transactional passwordless account codes. */

import "server-only";

import { isCustomerAuthDevelopmentPreview } from "./customer-security";

export async function sendCustomerLoginEmail(input: { challengeId: string; code: string; email: string }) {
  if (isCustomerAuthDevelopmentPreview()) return { delivered: false, preview: true } as const;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CUSTOMER_AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Customer account email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `customer-login-${input.challengeId}`
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `${input.code} is your Modern State sign-in code`,
      text: `Your Modern State sign-in code is ${input.code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: loginEmailHtml(input.code)
    })
  });

  if (!response.ok) throw new Error("Customer sign-in email could not be delivered.");
  return { delivered: true, preview: false } as const;
}

function loginEmailHtml(code: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1f2711"><div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;padding:32px"><p style="font-size:13px;font-weight:700;color:#155bc2">MODERN STATE</p><h1 style="font-size:24px;margin:16px 0 8px">Your sign-in code</h1><p style="color:#53606f">Enter this code to securely access your account.</p><p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:28px 0">${code}</p><p style="font-size:14px;color:#53606f">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div></body></html>`;
}
