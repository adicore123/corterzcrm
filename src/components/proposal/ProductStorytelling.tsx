import Image from "next/image";
import type { CatalogModel } from "@/lib/validation/models";
import {
  extractBatteryCapacityAh,
  extractBatteryVoltage,
  getModelImages,
  getProductFeatures,
  toWebglTextureUrl,
} from "@/components/catalog/catalog-utils";
import { getProposalHeroCutoutUrl, resolveModelVariants } from "@/lib/catalog/coastal-assets";

/**
 * SECTION 03 — Product Storytelling
 * - One distinct, high-quality visual per chapter — NEVER repeats the same image across chapters
 * - Excludes any raw WhatsApp photos and routes external images via Next.js image proxy
 * - When a chapter has no distinct image left, displays a clean engineering specification blueprint card
 */
export function ProductStorytelling({ model }: { model: CatalogModel }) {
  const primaryExhibit = getProposalHeroCutoutUrl(model);
  const variantImages = resolveModelVariants(model)
    .map((v) => v.imageUrl)
    .filter((u): u is string => Boolean(u));
  const rawGallery = getModelImages(model);

  const distinctVisuals: string[] = [];
  for (const candidate of [primaryExhibit, ...variantImages, ...rawGallery]) {
    if (!candidate) continue;
    if (candidate.toLowerCase().includes("whatsapp")) continue;
    const proxied = toWebglTextureUrl(candidate);
    if (!distinctVisuals.includes(proxied)) {
      distinctVisuals.push(proxied);
    }
  }

  const features = getProductFeatures(model);
  const voltage = extractBatteryVoltage(model);
  const capacityAh = extractBatteryCapacityAh(model);
  const computedWh = voltage && capacityAh ? Math.round(voltage * capacityAh) : null;

  const storyBlocks = features.slice(0, 3).map((feat, idx) => {
    const [headlineValue, ...bodyParts] = feat.description.split("\n\n");
    const bodyText = bodyParts.length > 0 ? bodyParts.join("\n\n") : feat.description;
    const metricBadge =
      feat.title.includes("סוללה") && computedWh
        ? `${voltage}V × ${capacityAh}Ah ≈ ${computedWh} Wh`
        : headlineValue !== bodyText
          ? headlineValue
          : undefined;

    return {
      index: idx + 1,
      title: feat.title,
      metricBadge,
      description: bodyText,
      // Assign each visual at most once — never wrap around with modulo
      image: idx < distinctVisuals.length ? distinctVisuals[idx] : undefined,
    };
  });

  if (storyBlocks.length === 0 && !model.publicDescription && !model.summary) {
    return null;
  }

  return (
    <section className="proposal-storytelling" id="proposal-story" aria-labelledby="story-title">
      <div className="proposal-section-heading">
        <span>03 / סיפור המוצר והרכיבים</span>
        <h2 id="story-title">לראות את הפרטים. להבין את הבחירה.</h2>
        <p>{model.publicDescription || model.summary || `מבט מעמיק על המכלולים והתכנון של ${model.name}.`}</p>
      </div>

      {storyBlocks.length > 0 && (
        <div className="proposal-story-stack">
          {storyBlocks.map((block, idx) => (
            <article
              key={`${block.title}-${idx}`}
              className={
                "proposal-story-row"
                + (idx % 2 === 1 ? " is-reversed" : "")
                + (!block.image ? " is-text-only" : "")
              }
            >
              <div className="proposal-story-copy">
                <div className="proposal-story-eyebrow">
                  <span className="proposal-story-index">פרק 0{block.index} · מפרט מכלול</span>
                  {block.metricBadge && (
                    <strong className="proposal-story-metric" dir="ltr">{block.metricBadge}</strong>
                  )}
                </div>
                <h3>{block.title}</h3>
                <p>{block.description}</p>
              </div>
              {block.image && (
                <div className="proposal-story-media">
                  <Image
                    src={block.image}
                    alt={`${model.name} — ${block.title}`}
                    fill
                    sizes="(max-width: 760px) 100vw, 48vw"
                    unoptimized
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
