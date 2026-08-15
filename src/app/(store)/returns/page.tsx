/**
 * Renders the secure customer returns portal.
 */

import type { Metadata } from "next";
import { ReturnsPortal } from "@/components/returns/returns-portal";

export const metadata: Metadata = {
  title: "Online Returns | Modern State",
  description: "Verify an order, request a return, download return documents, and check RMA status.",
  robots: { index: false, follow: false }
};

export default function ReturnsPage() {
  return (
    <main className="bg-background py-10 sm:py-16">
      <div className="container-shell">
        <ReturnsPortal />
      </div>
    </main>
  );
}
