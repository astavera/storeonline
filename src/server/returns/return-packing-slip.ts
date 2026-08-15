/**
 * Generates a small private PDF packing slip with a scan-friendly Code 39 RMA
 * barcode. Shippo is deliberately not involved in packing-slip generation.
 */

import "server-only";

import { returnReasonOptions } from "@/features/returns/contracts";
import type { ReturnRequestRecord } from "@/server/returns/return-repository";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const ITEMS_PER_PAGE = 16;

export function createReturnPackingSlipPdf(rma: ReturnRequestRecord) {
  const items = rma.items.filter((item) => item.decision !== "INELIGIBLE" && item.decision !== "REJECTED");
  const chunks = items.length > 0 ? chunk(items, ITEMS_PER_PAGE) : [[]];
  const fontObjectId = 3;
  const pageObjectIds = chunks.map((_, index) => 4 + index * 2);
  const streamObjectIds = chunks.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${chunks.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  chunks.forEach((pageItems, index) => {
    const stream = pageContent(rma, pageItems, index + 1, chunks.length);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${streamObjectIds[index]} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`
    );
  });

  return buildPdf(objects);
}

function pageContent(
  rma: ReturnRequestRecord,
  items: ReturnRequestRecord["items"],
  page: number,
  pageCount: number
) {
  const content: string[] = ["0 0 0 rg"];
  text(content, 42, 748, 18, "MODERN STATE - RETURN PACKING SLIP");
  text(content, 42, 721, 11, `RMA: ${rma.rmaNumber}`);
  text(content, 330, 721, 11, `Order: ${rma.orderNumber}`);
  drawCode39(content, rma.rmaNumber, 42, 660, 54, 510);
  text(content, 42, 646, 8, rma.rmaNumber.toUpperCase());
  text(content, 42, 620, 10, "Return destination");
  const destination = returnDestination();
  text(content, 42, 604, 9, `WH01 - ${destination.name}`);
  text(content, 42, 590, 9, `${destination.line1}${destination.line2 ? `, ${destination.line2}` : ""}`);
  text(content, 42, 576, 9, `${destination.city}, ${destination.state} ${destination.postalCode} ${destination.country}`);

  text(content, 42, 548, 10, "ITEM");
  text(content, 360, 548, 10, "QTY");
  text(content, 410, 548, 10, "REASON");
  content.push("0.75 w 42 541 m 570 541 l S");
  let y = 523;
  for (const item of items) {
    text(content, 42, y, 9, truncate(item.name, 48));
    text(content, 360, y, 9, String(item.quantity));
    const reason = returnReasonOptions.find((option) => option.code === item.reason)?.label ?? item.reason;
    text(content, 410, y, 8, truncate(reason, 25));
    const reference = item.sku || item.upc;
    if (reference) text(content, 42, y - 12, 7, `SKU/UPC: ${truncate(reference, 65)}`);
    y -= 31;
  }

  text(content, 42, 105, 9, "Refunds are issued only after WH01 receives and inspects the merchandise.");
  text(content, 42, 88, 8, "Place this slip inside the shipping box. Do not attach the carrier label to retail packaging.");
  text(content, 42, 48, 8, `Page ${page} of ${pageCount}  |  Status: ${rma.status}`);
  return content.join("\n");
}

function text(commands: string[], x: number, y: number, size: number, value: string) {
  commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
}

function drawCode39(
  commands: string[],
  raw: string,
  x: number,
  y: number,
  height: number,
  maxWidth: number
) {
  const encoded = `*${raw.toUpperCase().replace(/[^0-9A-Z .$/+%-]/g, "-").slice(0, 40)}*`;
  const patterns = [...encoded].map((character) => CODE_39[character] ?? CODE_39["-"]);
  const naturalWidth = patterns.reduce(
    (total, pattern) => total + [...pattern].reduce((width, part) => width + (part === "w" ? 3 : 1), 0) + 1,
    0
  );
  const unit = Math.min(1.35, maxWidth / naturalWidth);
  let cursor = x;
  for (const pattern of patterns) {
    [...pattern].forEach((part, index) => {
      const width = (part === "w" ? 3 : 1) * unit;
      if (index % 2 === 0) commands.push(`${cursor.toFixed(2)} ${y} ${width.toFixed(2)} ${height} re f`);
      cursor += width;
    });
    cursor += unit;
  }
}

function buildPdf(objects: string[]) {
  let document = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, "binary"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, "binary");
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    document += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "binary");
}

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/([\\()])/g, "\\$1");
}

function truncate(value: string, maximum: number) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 3)}...`;
}

function chunk<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

const CODE_39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn"
};

function returnDestination() {
  const destination = {
    name: process.env.SHIPPO_RETURN_ADDRESS_NAME?.trim() ?? "",
    line1: process.env.SHIPPO_RETURN_ADDRESS_LINE1?.trim() ?? "",
    line2: process.env.SHIPPO_RETURN_ADDRESS_LINE2?.trim() || null,
    city: process.env.SHIPPO_RETURN_ADDRESS_CITY?.trim() ?? "",
    state: process.env.SHIPPO_RETURN_ADDRESS_STATE?.trim().toUpperCase() ?? "",
    postalCode: process.env.SHIPPO_RETURN_ADDRESS_ZIP?.trim() ?? "",
    country: process.env.SHIPPO_RETURN_ADDRESS_COUNTRY?.trim().toUpperCase() ?? ""
  };
  if ([destination.name, destination.line1, destination.city, destination.state, destination.postalCode, destination.country].some((value) => !value)) {
    throw new Error("WH01 return address is not configured.");
  }
  return destination;
}
