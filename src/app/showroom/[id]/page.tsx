import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { ProductExperience } from "@/components/catalog/product-experience";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { catalogModels } from "@/lib/json-db/queries";
import { readStudioSelection } from "@/lib/catalog/studio-selection";

export const dynamic = "force-dynamic";
async function findModel(id: string) { return publicCatalogModels(await catalogModels()).find((model) => model.id === id); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const model = await findModel((await params).id);
  return { title: model ? `${model.name} | קטלוג קורטז` : "הדגם אינו זמין", description: model?.summary };
}
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [model, query] = await Promise.all([params.then((value) => findModel(value.id)), searchParams]);
  if (!model) notFound();
  return <main className="product-page" dir="rtl"><header className="product-page-header"><Link href="/showroom" aria-label="קטלוג קורטז"><Brand /></Link><Link href="/showroom">חזרה לכל הדגמים ←</Link></header><ProductExperience model={model} standalone initialStudioState={readStudioSelection(query)} /></main>;
}
