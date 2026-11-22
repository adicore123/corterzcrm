import type { CatalogModel, ModelSpec } from "@/lib/validation/models";

export function toWebglTextureUrl(url: string): string {
  if (url.startsWith("https://cortez.co.il/wp-content/uploads/")) {
    return "/api/catalog-image?url=" + encodeURIComponent(url);
  }
  return url;
}

export function isStudioCutoutImage(url: string): boolean {
  return url.includes("cortez.co.il/wp-content/uploads/") && !url.toLowerCase().includes("lifestyle");
}

export function getModelImages(model: CatalogModel): string[] {
  const uploaded = model.photos.map((photo) => "/api/images/models/" + model.id + "/" + photo.id);
  const external = [model.imageUrl, ...(model.galleryUrls ?? [])].filter((item): item is string => Boolean(item));
  return Array.from(new Set([...uploaded, ...external]));
}

export function is2027Model(model: CatalogModel): boolean {
  return model.name.includes("2027");
}

export function isPremiumModel(model: CatalogModel): boolean {
  const upper = model.name.toUpperCase();
  return upper.includes("PREMIUM") || upper.includes("MASTER") || upper.includes("RS") || (model.msrp ?? 0) >= 5500;
}

export type KeySpecs = {
  battery?: string;
  range?: string;
  speed?: string;
  highlight?: { label: string; value: string };
};

export function extractKeySpecs(model: CatalogModel): KeySpecs {
  const specs = model.specs ?? [];
  const find = (terms: string[]) =>
    specs.find((spec) => terms.some((term) => spec.label.includes(term)));

  const battery = find(["סוללה"])?.value;
  const range = find(["טווח"])?.value;
  const speed = find(["מהירות"])?.value;
  const motor = find(["מנוע", "בקר"]);
  const suspension = find(["שיכוך", "בלמים", "צמיגים", "גלגל"]);
  const highlight = motor ?? suspension;

  return {
    battery,
    range: model.metrics?.rangeKm === null ? undefined : range,
    speed: model.metrics?.speedKmh === null ? undefined : speed,
    highlight: highlight ? { label: highlight.label, value: highlight.value } : undefined,
  };
}

/** Educational context explains units/components without inventing performance claims. */
export function getProductFeatures(model: CatalogModel): { title: string; description: string }[] {
  if (model.features?.length) return model.features;
  const explanations: [RegExp, string][] = [
    [/סוללה/, "המתח (V) וקיבולת המטען (Ah) מתארים היבטים שונים של הסוללה. להשוואת אנרגיה בין מערכות במתחים שונים משתמשים ב־Wh; נתון זה לבדו אינו קובע את טווח הנסיעה."],
    [/בלמ/, "זהו סוג מערכת הבלימה שמופיע במפרט. לתפעול ולתחזוקה יש לפעול לפי הוראות הדגם; שם המותג לבדו אינו מעיד אם המערכת מכנית או הידראולית."],
    [/שיכוך/, "השיכוך נועד למתן את העברת הזעזועים מהדרך. בדקו במפרט אם הוא קדמי, אחורי או בשני הקצוות; מומלץ להתרשם מהתחושה בנסיעת ניסיון."],
    [/צמיג/, "מידות הצמיג מתארות את הקוטר והרוחב. הן חשובות גם לבחירת צמיג ופנימית חלופיים; יש להתאים לחץ אוויר לפי הוראות היצרן."],
    [/צג/, "הצג מציג מידע בזמן הרכיבה. סוג המידע והאפשרויות תלויים בצג המותקן בדגם ובהוראות ההפעלה שלו."],
    [/קיפול/, "לפני נשיאה או אחסון כדאי לבדוק את מידות הכלי במצב מקופל ואת הוראות נעילת המנגנון של הדגם."],
    [/פנס|תאורה/, "זהו אבזור התאורה המופיע במפרט. בדקו את אופן ההפעלה והקפידו על תקינות התאורה לפני רכיבה."],
    [/מנוע/, "זהו תיאור המנוע כפי שנמסר במפרט. תחושת הרכיבה תלויה גם בבקר, בסוללה ובעומס; תיאור כללי אינו תחליף לנתון הספק מאומת."],
  ];
  return (model.specs ?? []).flatMap((spec) => {
    const explanation = explanations.find(([pattern]) => pattern.test(spec.label));
    return explanation ? [{ title: spec.label, description: `${spec.value}\n\n${explanation[1]}` }] : [];
  });
}

export type ModelMetrics = {
  rangeKm: number | null;
  batteryWh: number | null;
  batteryLabel?: string;
  speedKmh: number | null;
  hasFullSuspension: boolean;
  hasHydraulicBrakes: boolean;
};

export function parseMetrics(model: CatalogModel): ModelMetrics {
  const specs = model.specs ?? [];
  const summary = model.summary ?? "";
  const findVal = (term: string) => specs.find((s) => s.label.includes(term))?.value;

  const rangeStr = findVal("טווח") ?? summary.match(/טווח[^.\n]{0,30}/)?.[0] ?? "";
  const rangeNums = [...rangeStr.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => n >= 10 && n <= 300);
  const rangeKm = rangeNums.length ? Math.round(Math.max(...rangeNums)) : null;

  const batteryLabel = findVal("סוללה");
  const batterySource = batteryLabel ?? summary;
  const battMatch = batterySource.match(/(\d+(?:\.\d+)?)\s*[vV]\s*[/×x*\-–]\s*(\d+(?:\.\d+)?)\s*[aA]/);
  const batteryWh = battMatch ? Math.round(Number(battMatch[1]) * Number(battMatch[2])) : null;

  const speedStr = findVal("מהירות");
  const speedMatch = speedStr?.match(/(\d+)/);
  const speedKmh = speedMatch ? Number(speedMatch[1]) : null;

  const suspAny = findVal("שיכוך");
  const suspFront = specs.find((s) => s.label.includes("שיכוך קדמי"))?.value ?? "";
  const suspRear = specs.find((s) => s.label.includes("שיכוך אחורי"))?.value ?? "";
  const hasFullSuspension =
    Boolean(suspAny && suspAny.includes("מלא"))
    || ((suspFront.includes("יש") || suspFront.includes("מלא")) && (suspRear.includes("יש") || suspRear.includes("מלא")))
    || summary.includes("שיכוך מלא");

  const brakeSpec = findVal("בלמ") ?? "";
  const brakeCheck = `${brakeSpec} ${summary}`.toLowerCase();
  const hasHydraulicBrakes = brakeCheck.includes("הידראול") || brakeCheck.includes("hydraulic") || brakeSpec.includes("שמן");

  return {
    rangeKm: model.metrics?.rangeKm !== undefined ? model.metrics.rangeKm : rangeKm,
    batteryWh: model.metrics?.batteryWh !== undefined ? model.metrics.batteryWh : batteryWh,
    batteryLabel,
    speedKmh: model.metrics?.speedKmh !== undefined ? model.metrics.speedKmh : speedKmh,
    hasFullSuspension,
    hasHydraulicBrakes,
  };
}

export type FitFilter = "long-range" | "full-susp" | "hydraulic";
export type CatalogFilterState = {
  search?: string;
  category?: string;
  fits?: FitFilter[];
  maxPrice?: number;
  voltage?: string;
  suspension?: string;
};

export function extractBatteryVoltage(model: CatalogModel): number | null {
  const battery = (model.specs ?? []).find((spec) => spec.label.includes("סוללה"))?.value ?? model.summary ?? "";
  const match = battery.match(/(\d+(?:\.\d+)?)\s*[vV]/);
  return match ? Math.round(Number(match[1])) : null;
}

export function filterCatalog(models: CatalogModel[], state: CatalogFilterState): CatalogModel[] {
  const query = state.search?.trim().toLocaleLowerCase("he") ?? "";
  return models.filter((model) => {
    if (state.category === "2027" && !is2027Model(model)) return false;
    if (state.category && !["all", "2027"].includes(state.category) && model.device !== state.category) return false;
    if (state.maxPrice && (model.msrp == null || model.msrp > state.maxPrice)) return false;
    if (state.voltage) {
      const voltage = extractBatteryVoltage(model);
      if (!voltage || String(voltage) !== state.voltage) return false;
    }
    const metrics = parseMetrics(model);
    if (state.suspension === "full" && !metrics.hasFullSuspension) return false;
    if (state.suspension === "front") {
      const frontSpec = (model.specs ?? []).find((spec) => spec.label.includes("שיכוך"))?.value ?? "";
      if (metrics.hasFullSuspension || !frontSpec.includes("יש") && !frontSpec.includes("קדמי")) return false;
    }
    if (state.fits?.some((fit) => fit === "long-range" ? (metrics.rangeKm ?? 0) < 45 : fit === "full-susp" ? !metrics.hasFullSuspension : !metrics.hasHydraulicBrakes)) return false;
    return !query || [model.name, model.device, model.summary ?? "", ...(model.specs ?? []).flatMap((spec) => [spec.label, spec.value])].some((text) => text.toLocaleLowerCase("he").includes(query));
  });
}

export type RideFinderStyle = "daily" | "long" | "compact";
export type RideFinderCriteria = {
  category: "all" | "אופניים חשמליים" | "קורקינט חשמלי";
  style: RideFinderStyle;
  minRange: number;
  maxBudget: number;
  requireFullSuspension: boolean;
  requireHydraulic: boolean;
};

export type RideFinderMatch = {
  model: CatalogModel;
  reasons: string[];
  score: number;
};

export function matchRideFinderModels(models: CatalogModel[], criteria: RideFinderCriteria): RideFinderMatch[] {
  const candidates = models.filter((model) => {
    if (model.published === false) return false;
    if (criteria.category !== "all" && model.device !== criteria.category) return false;
    if (criteria.maxBudget > 0 && (model.msrp == null || model.msrp > criteria.maxBudget)) return false;
    const metrics = parseMetrics(model);
    if (criteria.minRange > 0 && (metrics.rangeKm == null || metrics.rangeKm < criteria.minRange)) return false;
    if (criteria.requireFullSuspension && !metrics.hasFullSuspension) return false;
    if (criteria.requireHydraulic && !metrics.hasHydraulicBrakes) return false;
    return true;
  });

  const scored = candidates.map((model) => {
    const metrics = parseMetrics(model);
    const reasons: string[] = [];
    let score = 0;

    if (is2027Model(model)) {
      score += 3;
      reasons.push("סדרת 2027");
    }
    if (metrics.rangeKm && metrics.rangeKm >= criteria.minRange + 10) {
      score += 2;
      reasons.push(`טווח גבוה (${metrics.rangeKm} ק״מ)`);
    } else if (metrics.rangeKm) {
      reasons.push(`עד ${metrics.rangeKm} ק״מ`);
    }
    if (metrics.hasFullSuspension) {
      score += criteria.style === "long" ? 4 : 2;
      reasons.push("שיכוך מלא");
    }
    if (metrics.hasHydraulicBrakes) {
      score += criteria.requireHydraulic ? 3 : 2;
      reasons.push("בלמים הידראוליים");
    }
    if (criteria.style === "compact" && ((model.metrics?.weightKg ?? 99) <= 22 || model.name.includes("10X") || model.name.includes("SPOT") || model.name.includes("COPPER"))) {
      score += 4;
      reasons.push("קומפקטי וזריז לעיר");
    }
    if (criteria.style === "daily" && model.msrp && model.msrp <= Math.max(4800, criteria.maxBudget * 0.85)) {
      score += 2;
      reasons.push("משתלם ליומיום");
    }
    if (isPremiumModel(model)) score += 1;

    return { model, reasons: reasons.slice(0, 3), score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.model.msrp ?? 999_999) - (b.model.msrp ?? 999_999);
  });

  return scored.slice(0, 3);
}

export type SpecGroup = {
  id: "power" | "chassis" | "safety";
  title: string;
  specs: ModelSpec[];
};

const powerKeywords = ["מנוע", "סוללה", "טווח", "מהירות", "בקר", "הילוכים", "טעינה"];
const chassisKeywords = ["גלגל", "צמיג", "שיכוך", "מזלג", "בלמ", "שלדה", "כידון", "מושב", "סבל", "צבע"];

export function groupModelSpecs(specs?: ModelSpec[]): SpecGroup[] {
  if (!specs || specs.length === 0) return [];
  const power: ModelSpec[] = [];
  const chassis: ModelSpec[] = [];
  const safety: ModelSpec[] = [];

  for (const spec of specs) {
    if (powerKeywords.some((k) => spec.label.includes(k))) power.push(spec);
    else if (chassisKeywords.some((k) => spec.label.includes(k))) chassis.push(spec);
    else safety.push(spec);
  }

  return ([
    { id: "power", title: "מערכת הנעה ואנרגיה", specs: power },
    { id: "chassis", title: "שלדה, גלגלים ושיכוך", specs: chassis },
    { id: "safety", title: "בטיחות, תאורה ואבזור", specs: safety },
  ] as SpecGroup[]).filter((group) => group.specs.length > 0);
}

export function getFlagshipModels(models: CatalogModel[]): CatalogModel[] {
  const ranked = [...models].sort((a, b) => {
    const a27 = is2027Model(a) ? 1 : 0;
    const b27 = is2027Model(b) ? 1 : 0;
    if (b27 !== a27) return b27 - a27;
    const aPrem = isPremiumModel(a) ? 1 : 0;
    const bPrem = isPremiumModel(b) ? 1 : 0;
    if (bPrem !== aPrem) return bPrem - aPrem;
    const aWh = parseMetrics(a).batteryWh ?? 0;
    const bWh = parseMetrics(b).batteryWh ?? 0;
    if (bWh !== aWh) return bWh - aWh;
    return (b.msrp ?? 0) - (a.msrp ?? 0);
  });
  return ranked.slice(0, 5);
}

export function formatPrice(msrp?: number | null): string {
  if (!msrp || msrp <= 0) return "";
  return "₪" + msrp.toLocaleString("he-IL");
}

export function buildWhatsappSpecText(model: CatalogModel, showPrice: boolean, shareUrl?: string): string {
  const lines: string[] = [
    `*CORTEZ | ${model.name}*`,
    `קטגוריה: ${model.device}`,
  ];
  if (showPrice && model.msrp) {
    lines.push(`מחיר מומלץ לצרכן: ${formatPrice(model.msrp)}`);
  }
  if (model.summary) {
    lines.push("", model.summary);
  }
  if (model.specs && model.specs.length > 0) {
    lines.push("", "*מפרט טכני:*");
    for (const spec of model.specs) {
      lines.push(`• ${spec.label}: ${spec.value}`);
    }
  }
  if (shareUrl) {
    lines.push("", `לצפייה בתצוגת 3D ובגלריה המלאה: ${shareUrl}`);
  }
  return lines.join("\n");
}
