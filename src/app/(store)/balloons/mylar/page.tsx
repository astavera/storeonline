/**
 * Renders the balloons mylar page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function MylarBalloonsPage() {
  redirect("/balloons?collection=mylar");
}
