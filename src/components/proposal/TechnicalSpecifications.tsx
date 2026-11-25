import type { CatalogModel } from "@/lib/validation/models";
import {
  extractBatteryCapacityAh,
  extractBatteryVoltage,
  groupModelSpecs,
} from "@/components/catalog/catalog-utils";

function isLtrTechnicalValue(val: string): boolean {
  return /^[0-9a-zA-Z×x./\s\-+VAhW"״'%(),≈]+$/i.test(val.trim());
}

/** Custom thin-line SVG Check icon for boolean "יש" specs */
function SpecCheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="proposal-spec-bool-icon is-yes"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4.8 8.2L7.0 10.4L11.2 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Custom thin-line SVG Dash icon for boolean "ללא" / "אין" specs */
function SpecDashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="proposal-spec-bool-icon is-no"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.2 8H10.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function renderSpecValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (trimmed === "יש" || trimmed === "כן") {
    return (
      <span className="proposal-spec-bool-pill is-yes">
        <SpecCheckIcon />
        <span>כלול במפרט</span>
      </span>
    );
  }
  if (trimmed === "ללא" || trimmed === "אין" || trimmed === "לא") {
    return (
      <span className="proposal-spec-bool-pill is-no">
        <SpecDashIcon />
        <span>ללא</span>
      </span>
    );
  }
  const ltr = isLtrTechnicalValue(trimmed);
  return ltr ? <bdi dir="ltr">{trimmed}</bdi> : <bdi dir="auto">{trimmed}</bdi>;
}

/**
 * SECTION 04 — Full Technical Specifications
 * Grouped into:
 * - "הנעה ואנרגיה" (with computed energy in Wh when voltage and capacity exist)
 * - "שלדה ומתלים"
 * - "בטיחות ותאורה"
 * Hides vague non-numeric placeholders like "מנוע עוצמתי".
 */
export function TechnicalSpecifications({ model }: { model: CatalogModel }) {
  const hasDimensions = Boolean(model.studio?.dimensions || model.dimensions || model.foldedDimensions);
  const rawSpecs = (model.specs ?? []).filter(
    (s) => !(s.label.includes("מנוע") && s.value.trim() === "מנוע עוצמתי"),
  );

  const voltage = extractBatteryVoltage(model);
  const capacityAh = extractBatteryCapacityAh(model);
  const computedWh = voltage && capacityAh ? Math.round(voltage * capacityAh) : null;

  // Inject computed energy (Wh) if both voltage and capacity exist and Wh is not already listed
  const enrichedSpecs = [...rawSpecs];
  if (computedWh && !enrichedSpecs.some((s) => s.label.includes("אנרגיה"))) {
    const batteryIdx = enrichedSpecs.findIndex((s) => s.label.includes("סוללה"));
    const energySpec = {
      label: "אנרגיית סוללה מחושבת",
      value: `${voltage}V × ${capacityAh}Ah ≈ ${computedWh} Wh`,
    };
    if (batteryIdx >= 0) {
      enrichedSpecs.splice(batteryIdx + 1, 0, energySpec);
    } else {
      enrichedSpecs.unshift(energySpec);
    }
  }

  const groups = groupModelSpecs(enrichedSpecs).map((g) => ({
    ...g,
    title:
      g.id === "power"
        ? "הנעה ואנרגיה"
        : g.id === "chassis"
          ? "שלדה ומתלים"
          : "בטיחות ותאורה",
  }));

  return (
    <section className="proposal-product-details" id="proposal-specs" aria-labelledby="details-title">
      <div className="proposal-section-heading">
        <span>04 / המפרט הטכני המלא</span>
        <h2 id="details-title">כל פרט, במקום אחד.</h2>
        <p>מפרט הנדסי מאורגן לפי מערכות הכלי כפי שהוא מופיע בקטלוג הרשמי של קורטז.</p>
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

      {groups.length > 0 ? (
        <div className="proposal-spec-groups">
          {groups.map((group) => (
            <div key={group.id} className="proposal-spec-group-card">
              <h3 className="proposal-spec-group-title">{group.title}</h3>
              <dl className="proposal-spec-grid">
                {group.specs.map((spec) => (
                  <div key={`${spec.label}-${spec.value}`}>
                    <dt>{spec.label}</dt>
                    <dd>{renderSpecValue(spec.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <p className="proposal-no-specs">מפרט הדגם המפורט יימסר על ידי נציג קורטז.</p>
      )}
    </section>
  );
}
