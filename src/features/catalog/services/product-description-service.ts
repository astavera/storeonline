/**
 * Implements the product description service workflow for the catalog feature.
 */

export type SquareDescriptionInput = {
  descriptionHtml?: string | null;
  descriptionPlaintext?: string | null;
  squareDescriptionHash?: string | null;
};

export type ProductDescriptionOverride = {
  webDescriptionEn?: string | null;
  descriptionSource: "SQUARE" | "WEBSITE_OVERRIDE" | "GENERATED_DRAFT" | "ADMIN_APPROVED" | "EMPTY";
  descriptionStatus: "READY" | "NEEDS_REVIEW" | "MISSING" | "OUTDATED_SQUARE_CHANGED";
  useSquareDescription: boolean;
  lockWebDescription: boolean;
  squareDescriptionHash?: string | null;
};

export type DescriptionDisplayResult = {
  html: string;
  source: ProductDescriptionOverride["descriptionSource"];
  status: ProductDescriptionOverride["descriptionStatus"];
  needsAdminReview: boolean;
};

const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "span"]);
const unsafeBlockPattern = /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const unsafeSinglePattern = /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|svg|math)[^>]*\/?\s*>/gi;
const eventAttributePattern = /\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi;
const unsafeAttributePattern = /\s+(style|srcdoc|href|src|target|rel|class|id|data-[\w-]+)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi;
const javascriptUrlPattern = /javascript\s*:/gi;

export function sanitizeSquareDescriptionHtml(html: string) {
  return html
    .replace(unsafeBlockPattern, "")
    .replace(unsafeSinglePattern, "")
    .replace(eventAttributePattern, "")
    .replace(unsafeAttributePattern, "")
    .replace(javascriptUrlPattern, "")
    .replace(/<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g, (match, tagName: string) => {
      const normalized = tagName.toLowerCase();
      if (!allowedTags.has(normalized)) {
        return "";
      }
      return match.startsWith("</") ? `</${normalized}>` : `<${normalized}>`;
    })
    .trim();
}

export function plaintextToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<p>${escaped.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

export function resolveProductDescription(square: SquareDescriptionInput, override?: ProductDescriptionOverride | null): DescriptionDisplayResult {
  if (override?.webDescriptionEn && !override.useSquareDescription) {
    return {
      html: sanitizeSquareDescriptionHtml(override.webDescriptionEn),
      source: override.descriptionSource === "EMPTY" ? "WEBSITE_OVERRIDE" : override.descriptionSource,
      status: override.descriptionStatus,
      needsAdminReview: override.descriptionStatus !== "READY"
    };
  }

  if (square.descriptionHtml) {
    return {
      html: sanitizeSquareDescriptionHtml(square.descriptionHtml),
      source: "SQUARE",
      status: "READY",
      needsAdminReview: false
    };
  }

  if (square.descriptionPlaintext) {
    return {
      html: plaintextToHtml(square.descriptionPlaintext),
      source: "SQUARE",
      status: "READY",
      needsAdminReview: false
    };
  }

  return {
    html: "",
    source: "EMPTY",
    status: "MISSING",
    needsAdminReview: true
  };
}

export function detectSquareDescriptionChange(square: SquareDescriptionInput, override: ProductDescriptionOverride) {
  const changed = Boolean(square.squareDescriptionHash && override.squareDescriptionHash && square.squareDescriptionHash !== override.squareDescriptionHash);

  if (!changed) {
    return override.descriptionStatus;
  }

  if (override.useSquareDescription && !override.lockWebDescription) {
    return "READY";
  }

  return "OUTDATED_SQUARE_CHANGED";
}
