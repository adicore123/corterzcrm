import type { CatalogModel, StudioVariant } from "../validation/models";

export type CoastalVariantPreset = {
  id: string;
  title: string;
  color: string;
  imageUrl: string;
  sourceUrl?: string;
};

export type CoastalModelAsset = {
  slug: string;
  exhibitUrl: string;
  availabilityStatus: "in-stock" | "coming-soon" | "unknown";
  modelYear: number | null;
  batteryVoltage: number | null;
  batteryCapacityAh: number | null;
  brakeType: string | null;
  suspension: string | null;
  availableColors: string[];
  variants: CoastalVariantPreset[];
};

const COLOR_HEX_MAP: Record<string, string> = {
  "אדום": "#c82328",
  "זהב": "#c9a349",
  "כחול": "#22539e",
  "לבן": "#f3f4f6",
  "שחור": "#191b20",
  "כתום": "#e06224",
  "סהרה": "#c6ab83",
  "תכלת": "#4aa2d4",
  "ירוק בהיר": "#67b78c",
  "ירוק": "#277b4c",
  "ירוק זית": "#5c6742",
  "צהוב": "#dfb728",
  "קרבון": "#2f333a",
  "מנטה": "#98cfbe",
};

function variantItem(slug: string, idx: number, title: string): CoastalVariantPreset {
  return {
    id: `${slug}-c${idx}`,
    title,
    color: COLOR_HEX_MAP[title] ?? "#374151",
    imageUrl: `/catalog/variants/${slug}-color-${idx}.webp`,
  };
}

function entry(
  slug: string,
  config: Omit<CoastalModelAsset, "slug" | "exhibitUrl" | "variants"> & { colorVariants?: string[] },
): CoastalModelAsset {
  return {
    slug,
    exhibitUrl: `/catalog/exhibits/${slug}.webp`,
    availabilityStatus: config.availabilityStatus,
    modelYear: config.modelYear,
    batteryVoltage: config.batteryVoltage,
    batteryCapacityAh: config.batteryCapacityAh,
    brakeType: config.brakeType,
    suspension: config.suspension,
    availableColors: config.availableColors,
    variants: (config.colorVariants ?? []).map((title, idx) => variantItem(slug, idx, title)),
  };
}

const COASTAL_ASSETS_BY_NAME: Record<string, CoastalModelAsset> = {
  "cortez 10x": entry("cortez-10x", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 36,
    batteryCapacityAh: 10.4,
    brakeType: null,
    suspension: "קדמי",
    availableColors: [],
  }),
  "cortez spot": entry("cortez-spot", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 10,
    brakeType: null,
    suspension: "קדמי",
    availableColors: ["אדום", "זהב", "כחול", "לבן"],
    colorVariants: ["אדום", "זהב", "כחול", "לבן"],
  }),
  "cortez sport rs": entry("cortez-sport-rs", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: "דיסק מכני",
    suspension: null,
    availableColors: [],
  }),
  "cortez max 2 2027": entry("cortez-max-2-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: "דיסק מכני",
    suspension: null,
    availableColors: [],
  }),
  "cortez max 4 2027": entry("cortez-max-4-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: "דיסק מכני",
    suspension: null,
    availableColors: [],
  }),
  "cortez max 2 rs": entry("cortez-max-2-rs", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: "בלם דיסק הידראולי",
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez general": entry("cortez-general", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 10,
    brakeType: null,
    suspension: "קדמי",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez a1": entry("cortez-a1", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 15.6,
    brakeType: null,
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez mia": entry("cortez-mia", {
    availabilityStatus: "coming-soon",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 15.6,
    brakeType: "דיסק הידראולי NUTT",
    suspension: "מלא",
    availableColors: ["אדום", "כחול", "כתום", "סהרה", "תכלת"],
    colorVariants: ["אדום", "כחול", "כתום", "סהרה", "תכלת"],
  }),
  "shark g2 pro": entry("shark-g2-pro", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 18,
    brakeType: null,
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez max 3 2027": entry("cortez-max-3-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 18,
    brakeType: "בלם דיסק הידראולי",
    suspension: null,
    availableColors: [],
  }),
  "cortez xmax 48": entry("cortez-xmax-48", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 15,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez copper 12": entry("cortez-copper-12", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 10,
    brakeType: null,
    suspension: "קדמי",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez copper 14": entry("cortez-copper-14", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: null,
    suspension: "קדמי",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez copper 16": entry("cortez-copper-16", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 15.6,
    brakeType: null,
    suspension: "קדמי",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez nux 48": entry("cortez-nux-48", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "cortez supra 3": entry("cortez-supra-3", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["ירוק בהיר", "כחול", "לבן"],
    colorVariants: ["ירוק בהיר", "כחול", "לבן"],
  }),
  "cortez supra 4": entry("cortez-supra-4", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 13,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["ירוק בהיר", "כחול", "לבן"],
    colorVariants: ["ירוק בהיר", "כחול", "לבן"],
  }),
  "cortez supra 4 2027": entry("cortez-supra-4-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 21,
    brakeType: "דיסק הידראולי (שמן) XOD",
    suspension: null,
    availableColors: [],
  }),
  "eco xtreme tank m41": entry("eco-xtreme-tank-m41", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 15.6,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["שחור", "ירוק", "ירוק זית", "צהוב", "כחול"],
    colorVariants: ["שחור", "ירוק", "ירוק זית", "צהוב", "כחול"],
  }),
  "cortez all star": entry("cortez-all-star", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 21,
    brakeType: "דיסק הידראולי (שמן) Tektro",
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez black mamba 2027": entry("cortez-black-mamba-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 21,
    brakeType: "דיסק הידראולי (שמן) Tektro",
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez max 9": entry("cortez-max-9", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 18,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["שחור"],
    colorVariants: ["שחור"],
  }),
  "gmax": entry("gmax", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 18,
    brakeType: null,
    suspension: "מלא",
    availableColors: [],
  }),
  "shark master": entry("shark-master", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 52,
    batteryCapacityAh: 21,
    brakeType: null,
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez black mamba premium": entry("cortez-black-mamba-premium", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 48,
    batteryCapacityAh: 24,
    brakeType: null,
    suspension: "מלא",
    availableColors: [],
  }),
  "cortez emove": entry("cortez-emove", {
    availabilityStatus: "in-stock",
    modelYear: null,
    batteryVoltage: 60,
    batteryCapacityAh: 21,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["קרבון", "שחור"],
    colorVariants: ["קרבון", "שחור"],
  }),
  "cortez max 6 premium 2027": entry("cortez-max-6-premium-2027", {
    availabilityStatus: "in-stock",
    modelYear: 2027,
    batteryVoltage: 48,
    batteryCapacityAh: 21,
    brakeType: null,
    suspension: "מלא",
    availableColors: ["מנטה", "שחור"],
  }),
};

export const COASTAL_SCENERY_URL = "/catalog/scenery/cortez-coast.webp";

export function normalizeCatalogModelKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCoastalAsset(model: Pick<CatalogModel, "name">): CoastalModelAsset | undefined {
  return COASTAL_ASSETS_BY_NAME[normalizeCatalogModelKey(model.name)];
}

export function isCoastalExhibitUrl(url: string): boolean {
  return url.startsWith("/catalog/exhibits/");
}

/** Prefer CRM user uploads if added; otherwise use the clean cutout exhibit for the 3D beach stage. */
export function getPrimaryExhibitImage(model: CatalogModel): string | undefined {
  if (model.photos.length > 0) {
    return "/api/images/models/" + model.id + "/" + model.photos[0].id;
  }
  const asset = getCoastalAsset(model);
  if (asset?.exhibitUrl) return asset.exhibitUrl;
  return model.imageUrl || model.galleryUrls?.[0];
}

/** Prefer CRM-authored studio variants; otherwise return official color variants. */
export function resolveModelVariants(model: CatalogModel): StudioVariant[] {
  if (model.studio?.variants?.length) {
    return model.studio.variants;
  }
  const asset = getCoastalAsset(model);
  if (!asset?.variants.length) return [];
  return asset.variants.map((variant) => ({
    id: variant.id,
    title: variant.title,
    color: variant.color,
    imageUrl: variant.imageUrl,
    availability: asset.availabilityStatus === "coming-soon" ? "unknown" : "available",
  }));
}
