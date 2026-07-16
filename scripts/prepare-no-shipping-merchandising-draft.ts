import { existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnvironment();

const values = process.argv.slice(2);
const apply = values.includes("--apply");
const confirmationIndex = values.indexOf("--confirm");
const confirmation = confirmationIndex >= 0 ? values[confirmationIndex + 1] ?? "" : "";
validateArguments(values);

try {
  const { auditNoShippingDraft, createNoShippingDraft } = await import("@/server/admin/website-merchandising-draft-preparation");
  const result = apply ? await createNoShippingDraft(confirmation) : await auditNoShippingDraft();
  console.log(JSON.stringify({
    mode: apply ? "no-shipping-merchandising-draft-apply" : "no-shipping-merchandising-draft-audit",
    publishesContent: false,
    squareWritesEnabled: false,
    squareOrderCreated: false,
    paymentCaptured: false,
    ...result
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    mode: apply ? "no-shipping-merchandising-draft-apply" : "no-shipping-merchandising-draft-audit",
    ok: false,
    error: describeError(error, "No-shipping merchandising draft preparation failed.")
  }, null, 2));
  process.exitCode = 1;
}

function loadEnvironment() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function validateArguments(arguments_: string[]) {
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === "--apply") continue;
    if (value === "--confirm") {
      const next = arguments_[index + 1];
      if (!next || next.startsWith("--")) failInvalid("--confirm requires a value.");
      index += 1;
      continue;
    }
    failInvalid(`Unknown option: ${value}`);
  }
  if (apply && !confirmation) failInvalid("Apply mode requires --confirm.");
  if (!apply && confirmation) failInvalid("--confirm is only valid with --apply.");
}

function failInvalid(message: string): never {
  console.error(JSON.stringify({ mode: "invalid-cli", ok: false, error: message }, null, 2));
  process.exit(1);
}

function describeError(error: unknown, fallback: string) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message && !messages.includes(current.message)) messages.push(current.message);
    current = current.cause;
  }
  return (messages.length > 0 ? messages.join(" Caused by: ") : fallback)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s@]+@/gi, "[redacted-url]")
    .slice(0, 500);
}
