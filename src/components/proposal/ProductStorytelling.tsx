import type { CatalogModel } from "@/lib/validation/models";
import { getModelImages, getProductFeatures } from "@/components/catalog/catalog-utils";
import { getPrimaryExhibitImage } from "@/lib/catalog/coastal-assets";

/**
 * SECTION 04 — Product Storytelling
 * Pairs authentic product photography with verified component explanations.
 * Never invents unverified marketing claims.
 */
export function ProductStorytelling({ model }: { model: CatalogModel }) {
  const images = getModelImages(model);
  const primaryExhibit = getPrimaryExhibitImage(model);
  const allVisuals = Array.from(new Set([primaryExhibit, ...images].filter((v): v is string => Boolean(v))));
  const features = getProductFeatures(model);

  const storyBlocks = features.slice(0, 3).map((feat, idx) => ({
    index: idx + 1,
    title: feat.title,
    description: feat.description,
    image: allVisuals[idx % Math.max(allVisuals.length, 1)],
  }));

  if (storyBlocks.length === 0 && !model.publicDescription && !model.summary) {
    return null;
  }

  return (
    <section className="proposal-storytelling" id="proposal-story" aria-labelledby="story-title">
      <div className="proposal-section-heading">
        <span>04 / סיפור המוצר והרכיבים</span>
        <h2 id="story-title">לראות את הפרטים. להבין את הבחירה.</h2>
        <p>{model.publicDescription || model.summary || `מבט מעמיק על המכלולים והתכנון של ${model.name}.`}</p>
      </div>

      {storyBlocks.length > 0 && (
        <div className="proposal-story-list">
          {storyBlocks.map((block, idx) => (
            <article
              key={`${block.title}-${idx}`}
              className={"proposal-story-row" + (idx % 2 === 1 ? " is-reversed" : "")}
            >
              <div className="proposal-story-copy">
                <span className="proposal-story-step">פרק 0{block.index} · מפרט מכלול</span>
                <h3>{block.title}</h3>
                <p>{block.description}</p>
              </div>
              {block.image && (
                <div className="proposal-story-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={block.image} alt={`${model.name} — ${block.title}`} loading="lazy" />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
