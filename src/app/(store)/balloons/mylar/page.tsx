import { redirect } from "next/navigation";

export default function MylarBalloonsPage() {
  redirect("/balloons?collection=mylar");
}
