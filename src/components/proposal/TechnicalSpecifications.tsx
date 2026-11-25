import type { CatalogModel } from "@/lib/validation/models";

function isLtrTechnicalValue(val: string): boolean {
  return /^[0-9a-zA-Z×x./\s\-+VAhW"״'%(),]+$/i.test(val.trim());
}

/**
 * SECTION 05 — Full Technical Specifications
 * Responsive, organized specification & dimensions matrix with native RTL/LTR bidirectional formatting.
 */
export function TechnicalSpecifications({ model }: { model: CatalogModel }) {
  const hasDimensions = Boolean(model.studio?.dimensions || model.dimensions || model.foldedDimensions);
  const specs = model.specs ?? [];

  return (
    <section className="proposal-product-details" id="proposal-specs" aria-labelledby="details-title">
      <div className="proposal-section-heading">
        <span>05 / המפרט הטכני המלא</span>
        <h2 id="details-title">כל פרט, במקום אחד.</h2>
        <p>מפרט, מידות ותכונות הדגם כפי שהם מופיעים בקטלוג הרשמי של קורטז.</p>
      </div>

      {hasDimensions && (
        <dl className="proposal-spec-grid proposal-dimensions-grid" aria-label="מידות הדגם">
          {model.studio?.dimensions && (
            <div>
              <dt>מידות מאומתות (אורך × רוחב × גובה)</dt>
              <dd>
                <bdi dir="ltr">
                  {Math.round(model.studio.dimensions.length * 100)} × {Math.round(model.studio.dimensions.width * 100)} × {Math.round(model.studio.dimensions.height * 100)}
                </bdi>{" "}
                ס״מ
              </dd>
            </div>
          )}
          {model.dimensions && (
            <div>
              <dt>מידות הכלי</dt>
              <dd><bdi dir="auto">{model.dimensions}</bdi></dd>
            </div>
          )}
          {model.foldedDimensions && (
            <div>
              <dt>מידות במצב מקופל</dt>
              <dd><bdi dir="auto">{model.foldedDimensions}</bdi></dd>
            </div>
          )}
        </dl>
      )}

      {specs.length > 0 ? (
        <dl className="proposal-spec-grid">
          {specs.map((spec) => {
            const ltr = isLtrTechnicalValue(spec.value);
            return (
              <div key={`${spec.label}-${spec.value}`}>
                <dt>{spec.label}</dt>
                <dd>{ltr ? <bdi dir="ltr">{spec.value}</bdi> : <bdi dir="auto">{spec.value}</bdi>}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="proposal-no-specs">מפרט הדגם המפורט יימסר על ידי נציג קורטז.</p>
      )}
    </section>
  );
}
