/**
 * Renders the balloons bouquets page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function BalloonBouquetsPage() {
  redirect("/balloons?collection=bouquets");
}
