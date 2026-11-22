"use client";

import { useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeft, ArrowRight, Bike, Check, Compass, GitCompareArrows, RotateCcw, Sparkles, X } from "lucide-react";
import type { CatalogModel } from "@/lib/validation/models";
import { getPrimaryExhibitImage } from "@/lib/catalog/coastal-assets";
import { extractKeySpecs, formatPrice, matchRideFinderModels, parseMetrics, type RideFinderCriteria, type RideFinderStyle } from "./catalog-utils";

const defaultCriteria: RideFinderCriteria = {
  category: "all",
  style: "daily",
  minRange: 30,
  maxBudget: 6500,
  requireFullSuspension: false,
  requireHydraulic: false,
};

export function RideFinderDialog({
  open,
  onOpenChange,
  models,
  showPrice,
  compareIds,
  onOpenModel,
  onToggleCompare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: CatalogModel[];
  showPrice: boolean;
  compareIds: string[];
  onOpenModel: (model: CatalogModel) => void;
  onToggleCompare: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [criteria, setCriteria] = useState<RideFinderCriteria>(defaultCriteria);

  const matches = useMemo(() => matchRideFinderModels(models, criteria), [models, criteria]);

  function resetWizard() {
    setStep(0);
    setCriteria(defaultCriteria);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay no-print" />
        <Dialog.Content className="ride-finder-modal no-print" dir="rtl">
          <div className="ride-finder-header">
            <div className="ride-finder-title-wrap">
              <span className="ride-finder-eyebrow">
                <Compass size={14} aria-hidden /> FIND YOUR CORTEZ
              </span>
              <Dialog.Title>מצאו את הקורטז שמתאים לכם</Dialog.Title>
              <Dialog.Description className="sr-only">
                אשף קצר בן ארבעה שלבים להתאמת אופניים או קורקינט חשמלי לפי שימוש, טווח ותקציב
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="ride-finder-close" aria-label="סגירת אשף התאמה">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="ride-finder-progress" aria-label={`שלב ${step + 1} מתוך 5`}>
            {[0, 1, 2, 3, 4].map((idx) => (
              <span key={idx} className={idx <= step ? "is-active" : undefined} />
            ))}
          </div>

          {step === 0 && (
            <div className="ride-finder-step">
              <h3>איזה כלי אתם מחפשים?</h3>
              <p>בחרו את הקטגוריה שמתאימה ליום־יום שלכם.</p>
              <div className="ride-finder-choices">
                {([
                  ["אופניים חשמליים", "אופניים חשמליים", "נוחות, יציבות וטווח עירוני ובין־עירוני"],
                  ["קורקינט חשמלי", "קורקינט חשמלי", "זריזות, אחסון נוח ונסיעה קלילה"],
                  ["all", "הראו לי הכל", "השוואה פתוחה בין כל דגמי CORTEZ"],
                ] as const).map(([value, title, sub]) => (
                  <button
                    key={value}
                    type="button"
                    className={"ride-finder-choice" + (criteria.category === value ? " is-active" : "")}
                    aria-pressed={criteria.category === value}
                    onClick={() => setCriteria((prev) => ({ ...prev, category: value }))}
                  >
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="ride-finder-step">
              <h3>איך נראית הרכיבה הטיפוסית שלכם?</h3>
              <p>התאמת אופי הרכיבה משקללת ניידות, שיכוך ונוחות לאורך זמן.</p>
              <div className="ride-finder-choices">
                {([
                  ["daily", "נסיעות יום־יום", "עבודה, לימודים וסידורים בעיר"],
                  ["long", "רכיבות ארוכות", "סוללה גדולה, יציבות ושיכוך משופר"],
                  ["compact", "קומפקטי ונייד", "קל יותר לנשיאה, מעליות ורכבת"],
                ] as [RideFinderStyle, string, string][]).map(([value, title, sub]) => (
                  <button
                    key={value}
                    type="button"
                    className={"ride-finder-choice" + (criteria.style === value ? " is-active" : "")}
                    aria-pressed={criteria.style === value}
                    onClick={() => setCriteria((prev) => ({ ...prev, style: value }))}
                  >
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="ride-finder-step">
              <h3>מה טווח הנסיעה המינימלי שחשוב לכם?</h3>
              <p>מבוסס על נתוני הטווח המפורסמים במפרט הדגם הרשמי.</p>
              <div className="ride-finder-slider-box">
                <strong dir="ltr">{criteria.minRange} KM</strong>
                <input
                  type="range"
                  min={20}
                  max={60}
                  step={5}
                  value={criteria.minRange}
                  aria-label="טווח נסיעה מינימלי בקילומטרים"
                  onChange={(event) => setCriteria((prev) => ({ ...prev, minRange: Number(event.target.value) }))}
                />
                <small>טווח הנסיעה בפועל מושפע ממשקל הרוכב, תוואי השטח ומצב הסוללה.</small>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="ride-finder-step">
              <h3>תקציב ומפרט מועדף</h3>
              <p>כוונו את התקציב המרבי וסמנו אם חשוב לכם אבזור מתקדם.</p>
              <div className="ride-finder-slider-box">
                <strong dir="ltr">עד ₪{criteria.maxBudget.toLocaleString("he-IL")}</strong>
                <input
                  type="range"
                  min={2200}
                  max={9000}
                  step={100}
                  value={criteria.maxBudget}
                  aria-label="תקציב מרבי בשקלים"
                  onChange={(event) => setCriteria((prev) => ({ ...prev, maxBudget: Number(event.target.value) }))}
                />
              </div>
              <div className="ride-finder-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={criteria.requireFullSuspension}
                    onChange={(event) => setCriteria((prev) => ({ ...prev, requireFullSuspension: event.target.checked }))}
                  />
                  <span>חשוב לי שיכוך מלא לנוחות מירבית</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={criteria.requireHydraulic}
                    onChange={(event) => setCriteria((prev) => ({ ...prev, requireHydraulic: event.target.checked }))}
                  />
                  <span>מעדיף בלמי דיסק הידראוליים</span>
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="ride-finder-step">
              <h3>ההתאמות המובילות עבורכם</h3>
              <p>
                טווח של לפחות {criteria.minRange} ק״מ · עד ₪{criteria.maxBudget.toLocaleString("he-IL")}
                {criteria.requireFullSuspension ? " · שיכוך מלא" : ""}
                {criteria.requireHydraulic ? " · בלמים הידראוליים" : ""}
              </p>

              {matches.length > 0 ? (
                <div className="ride-finder-results">
                  {matches.map(({ model, reasons }) => {
                    const img = getPrimaryExhibitImage(model);
                    const kpi = extractKeySpecs(model);
                    const metrics = parseMetrics(model);
                    const inCompare = compareIds.includes(model.id);
                    const price = showPrice ? formatPrice(model.msrp) : "";
                    return (
                      <article className="ride-finder-card" key={model.id}>
                        <div className="ride-finder-thumb">
                          {img ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={img} alt={model.name} loading="lazy" />
                          ) : <Bike size={34} />}
                        </div>
                        <div className="ride-finder-card-body">
                          <div className="ride-finder-card-head">
                            <strong>{model.name}</strong>
                            {price && <span className="ride-finder-price" dir="ltr">{price}</span>}
                          </div>
                          <div className="ride-finder-reasons">
                            {reasons.map((reason) => <span key={reason}>{reason}</span>)}
                          </div>
                          <div className="ride-finder-specs">
                            <span>{metrics.rangeKm ? `עד ${metrics.rangeKm} ק״מ` : (kpi.range ?? "—")}</span>
                            <span dir="ltr">{kpi.battery ?? "—"}</span>
                          </div>
                          <div className="ride-finder-card-actions">
                            <button
                              type="button"
                              className="coastal-btn primary small"
                              onClick={() => {
                                onOpenChange(false);
                                onOpenModel(model);
                              }}
                            >
                              <Sparkles size={14} /> פתיחה בסטודיו
                            </button>
                            <button
                              type="button"
                              className={"coastal-btn outline small" + (inCompare ? " is-active" : "")}
                              onClick={() => onToggleCompare(model.id)}
                            >
                              {inCompare ? <Check size={14} /> : <GitCompareArrows size={14} />}
                              <span>{inCompare ? "בהשוואה" : "השוואה"}</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="ride-finder-empty">
                  <Bike size={34} />
                  <strong>לא נמצאה התאמה מדויקת לכל התנאים</strong>
                  <p>אפשר לחזור צעד אחורה ולהגדיל את התקציב או להקל באחד הסינונים.</p>
                </div>
              )}
            </div>
          )}

          <div className="ride-finder-footer">
            {step < 4 ? (
              <>
                <button
                  type="button"
                  className="coastal-btn primary"
                  onClick={() => setStep((s) => s + 1)}
                >
                  <span>{step === 3 ? "גלו את ההתאמות שלי" : "המשך"}</span>
                  <ArrowLeft size={16} />
                </button>
                {step > 0 && (
                  <button type="button" className="coastal-btn outline" onClick={() => setStep((s) => s - 1)}>
                    <ArrowRight size={16} /> חזרה
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="coastal-btn primary" onClick={resetWizard}>
                  <RotateCcw size={15} /> חיפוש והתאמה מחדש
                </button>
                <button type="button" className="coastal-btn outline" onClick={() => setStep(3)}>
                  עדכון תנאים
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
