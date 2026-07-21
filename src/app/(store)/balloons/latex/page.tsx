import { redirect } from "next/navigation";

export default function LatexBalloonsPage() {
  redirect("/balloons?collection=latex");
}
