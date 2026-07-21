import { BalloonsPageTemplate } from "@/components/templates/balloons-page-template";

export const metadata = {
  title: "Balloons",
  description: "Order balloons for pickup or local delivery through a guided Modern State balloon flow."
};

type BalloonsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BalloonsPage({ searchParams }: BalloonsPageProps) {
  const params = await searchParams;
  const collection = Array.isArray(params?.collection) ? params.collection[0] : params?.collection;
  return <BalloonsPageTemplate initialCollection={collection} />;
}
