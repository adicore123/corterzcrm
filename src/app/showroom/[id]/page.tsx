import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { ProductExperience } from "@/components/catalog/product-experience";
import { extractKeySpecs, formatPrice, parseMetrics } from "@/components/catalog/catalog-utils";
import { getPrimaryExhibitImage } from "@/lib/catalog/coastal-assets";
import { publicCatalogModels } from "@/lib/catalog/public-model";
import { readStudioSelection } from "@/lib/catalog/studio-selection";
import { catalogModels } from "@/lib/json-db/queries";

export const dynamic = "force-dynamic";

async function findModel(id: string) {
  const all = publicCatalogModels(await catalogModels());
  const model = all.find((item) => item.id === id);
  return { model, all };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { model } = await findModel((await params).id);
  const ogImage = model ? (getPrimaryExhibitImage(model) ?? model.imageUrl) : undefined;
  return {
    title: model ? `${model.name} | קטלוג קורטז` : "הדגם אינו זמין",
    description: model?.summary,
    openGraph: ogImage ? { images: [ogImage] } : undefined,
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ model, all }, query] = await Promise.all([params.then((value) => findModel(value.id)), searchParams]);
  if (!model) notFound();

  const related = all
    .filter((item) => item.id !== model.id && item.device === model.device)
    .sort((a, b) => Math.abs((a.msrp ?? 0) - (model.msrp ?? 0)) - Math.abs((b.msrp ?? 0) - (model.msrp ?? 0)))
    .slice(0, 3);

  const schemaImage = getPrimaryExhibitImage(model) ?? model.imageUrl;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: model.name,
    description: model.summary || model.publicDescription,
    ...(schemaImage ? { image: [schemaImage] } : {}),
    brand: { "@type": "Brand", name: "CORTEZ" },
    ...(model.msrp != null ? { offers: { "@type": "Offer", price: model.msrp, priceCurrency: "ILS" } } : {}),
  };

  return (
    <main className="product-page" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <header className="product-page-header">
        <Link href="/showroom" aria-label="קטלוג קורטז"><Brand /></Link>
        <Link href="/showroom">חזרה לאולם התצוגה ←</Link>
      </header>

      <ProductExperience model={model} standalone initialStudioState={readStudioSelection(query)} />

      {related.length > 0 && (
        <section className="product-related-section no-print" aria-label="דגמים נוספים מאותה קטגוריה">
          <div className="product-related-head">
            <div>
              <span>עוד בקטגוריית {model.device}</span>
              <h2>דגמים נוספים שיעניינו אתכם</h2>
            </div>
            <Link href="/showroom">לכל הדגמים ←</Link>
          </div>
          <div className="product-related-grid">
            {related.map((item) => {
              const img = getPrimaryExhibitImage(item);
              const kpi = extractKeySpecs(item);
              const metrics = parseMetrics(item);
              const price = formatPrice(item.msrp);
              return (
                <Link href={`/showroom/${item.id}`} className="product-related-card" key={item.id}>
                  <div className="product-related-thumb">
                    {img && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={img} alt={item.name} loading="lazy" />
                    )}
                  </div>
                  <strong dir="ltr">{item.name}</strong>
                  <small>
                    {metrics.rangeKm ? `עד ${metrics.rangeKm} ק״מ` : kpi.range || item.device}
                    {kpi.battery ? ` · ${kpi.battery}` : ""}
                  </small>
                  {price && <span className="product-related-price" dir="ltr">{price}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
