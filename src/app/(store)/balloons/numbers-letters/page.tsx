/**
 * Renders the balloons numbers letters page and prepares its route-level data.
 */

import { redirect } from "next/navigation";

export default function NumberLetterBalloonsPage() {
  redirect("/balloons?collection=numbers");
}
