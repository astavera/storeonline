import { redirect } from "next/navigation";

export default function NumberLetterBalloonsPage() {
  redirect("/balloons?collection=numbers");
}
