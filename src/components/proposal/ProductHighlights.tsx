import type { CatalogModel } from "@/lib/validation/models";
import { extractBatteryCapacityAh, extractBatteryVoltage } from "@/components/catalog/catalog-utils";
import { BatteryCharging, Compass, Disc, Gauge, Layers, Monitor, ShieldCheck, Sparkles } from "lucide-react";

interface HighlightItem {
  key: string;
  category: string;
  value: string;
  detail: string;
  ltr?: boolean;
}

const HIGHLIGHT_MATCHERS: Array<{
  key: string;
  category: string;
  terms: string[];
  detail: string;
  ltr?: boolean;
}> = [
  {
    key: "battery",
    category: "מערכת סוללה ואנרגיה",
    terms: ["סוללה", "מתח", "קיבולת"],
    detail: "תאי אנרגיה מותאמים לטווח נסיעה יציב ואספקת כוח רציפה.",
    ltr: true,
  },
  {
    key: "range",
    category: "טווח נסיעה",
    terms: ["טווח"],
    detail: "טווח נסיעה מפורסם בתנאי רכיבה תקניים לפי מפרט הדגם.",
  },
  {
    key: "motor",
    category: "הנעה ובקר",
    terms: ["בקר", "מנוע", "הספק"],
    detail: "מערכת הנעה חשמלית מבוקרת לתגובה חלקה ויעילה בעיר.",
  },
  {
    key: "brakes",
    category: "מערכת בלימה",
    terms: ["בלמ", "בלימה", "דיסק"],
    detail: "מערכת בלימה מתקדמת לעצירה מדויקת ובטוחה בכל תנאי דרך.",
  },
  {
    key: "tires",
    category: "צמיגים וגלגלים",
    terms: ["צמיג", "גלגל", "קוטר"],
    detail: "אחיזת כביש ויציבות מוגברת ברכיבה עירונית ובינעירונית.",
    ltr: true,
  },
  {
    key: "suspension",
    category: "מערכת שיכוך",
    terms: ["שיכוך", "בולם", "מזלג"],
    detail: "ספיגת זעזועים מכוילת לנוחות רכיבה מרבית לאורך זמן.",
  },
  {
    key: "display",
    category: "צג ובקרה",
    terms: ["צג", "מסך", "תצוגה"],
    detail: "תצוגת נתוני רכיבה, מהירות ומצב סוללה בזמן אמת.",
  },
  {
    key: "frame",
    category: "שלדה והילוכים",
    terms: ["הילוכים", "שלדה", "משקל", "קיפול"],
    detail: "הנדסת שלדה ומכלולים המשלבת חוזק מבני ונוחות תפעול יומיומית.",
  },
];

function getIcon(key: string) {
  switch (key) {
    case "battery": return <BatteryCharging size={20} aria-hidden />;
    case "range": return <Compass size={20} aria-hidden />;
    case "motor": return <Gauge size={20} aria-hidden />;
    case "brakes": return <Disc size={20} aria-hidden />;
    case "tires": return <Layers size={20} aria-hidden />;
    case "suspension": return <ShieldCheck size={20} aria-hidden />;
    case "display": return <Monitor size={20} aria-hidden />;
    default: return <Sparkles size={20} aria-hidden />;
  }
}

/** Filters out vague non-numeric placeholders such as "מנוע עוצמתי" */
function isVagueSpec(label: string, value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (label.includes("מנוע") && v === "מנוע עוצמתי") return true;
  return false;
}

/**
 * SECTION 02 — Key Product Highlights
 * Strictly renders verified specifications with computed Wh energy when both V and Ah exist.
 */
export function ProductHighlights({ model }: { model: CatalogModel }) {
  const specs = (model.specs ?? []).filter((s) => !isVagueSpec(s.label, s.value));
  const usedLabels = new Set<string>();
  const items: HighlightItem[] = [];

  const voltage = extractBatteryVoltage(model);
  const capacityAh = extractBatteryCapacityAh(model);
  const computedWh = voltage && capacityAh ? Math.round(voltage * capacityAh) : null;

  for (const matcher of HIGHLIGHT_MATCHERS) {
    const found = specs.find(
      (s) => !usedLabels.has(s.label) && matcher.terms.some((term) => s.label.includes(term)),
    );
    if (found && found.value.trim()) {
      usedLabels.add(found.label);
      const isBattery = matcher.key === "battery" && computedWh;
      items.push({
        key: matcher.key,
        category: found.label,
        value: found.value.trim(),
        detail: isBattery
          ? `קיבולת אנרגיה מחושבת של כ־${computedWh} Wh (${voltage}V × ${capacityAh}Ah) לאספקת כוח רציפה.`
          : matcher.detail,
        ltr: matcher.ltr || /^[0-9a-zA-Z×x./\s\-+VAhW"״']+$/i.test(found.value.trim()),
      });
    }
  }

  for (const spec of specs) {
    if (items.length >= 6) break;
    if (!usedLabels.has(spec.label) && spec.value.trim()) {
      usedLabels.add(spec.label);
      items.push({
        key: spec.label,
        category: spec.label,
        value: spec.value.trim(),
        detail: "נתון מפרט רשמי מתוך קטלוג קורטז.",
        ltr: /^[0-9a-zA-Z×x./\s\-+VAhW"״']+$/i.test(spec.value.trim()),
      });
    }
  }

  if (items.length === 0 && (model.features?.length ?? 0) === 0) return null;

  return (
    <section className="proposal-highlights" id="proposal-highlights" aria-labelledby="highlights-title">
      <div className="proposal-section-heading">
        <span>02 / נתוני מפתח ומאפייני ליבה</span>
        <h2 id="highlights-title">הנדסה מדויקת. נוכחות שמורגשת בכל נסיעה.</h2>
        <p>נתוני הליבה המאומתים של {model.name} מתוך מפרט הדגם הרשמי של קורטז.</p>
      </div>

      {items.length > 0 ? (
        <div className="proposal-highlight-grid">
          {items.slice(0, 6).map((item, idx) => (
            <article key={`${item.key}-${idx}`} className="proposal-kpi-card">
              <div className="proposal-kpi-top">
                <span className="proposal-kpi-num">0{idx + 1}</span>
                <span className="proposal-kpi-icon">{getIcon(item.key)}</span>
              </div>
              <span className="proposal-kpi-category">{item.category}</span>
              <h3 className="proposal-kpi-value">
                {item.ltr ? <bdi dir="ltr">{item.value}</bdi> : item.value}
              </h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="proposal-highlight-grid">
          {model.features?.slice(0, 3).map((feature, index) => (
            <article key={`${feature.title}-${index}`} className="proposal-kpi-card">
              <div className="proposal-kpi-top">
                <span className="proposal-kpi-num">0{index + 1}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
