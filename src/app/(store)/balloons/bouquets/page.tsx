import { redirect } from "next/navigation";

export default function BalloonBouquetsPage() {
  redirect("/balloons?collection=bouquets");
}
