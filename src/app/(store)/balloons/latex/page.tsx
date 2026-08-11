/**
 * Renders the balloons latex page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function LatexBalloonsPage() {
  redirect("/balloons?collection=latex");
}
