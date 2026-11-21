import type { CatalogModel, Device } from "../validation/models";

const catalogSeed: Array<[index: number, device: Device, name: string, imageUrl: string]> = [
  // קורקינטים חשמליים (11)
  [1, "קורקינט חשמלי", "CORTEZ 10X", "https://cortez.co.il/wp-content/uploads/2026/06/89a5821a-b886-4c7d-b12c-ffa4ecc3cfeb.jpg"],
  [2, "קורקינט חשמלי", "CORTEZ A1", "https://cortez.co.il/wp-content/uploads/2025/12/6-scaled.jpg"],
  [3, "קורקינט חשמלי", "CORTEZ MIA", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-mia-orange.jpg"],
  [4, "קורקינט חשמלי", "CORTEZ XMAX 48", "https://cortez.co.il/wp-content/uploads/2025/08/%D7%A2%D7%99%D7%A6%D7%95%D7%91-%D7%9C%D7%9C%D7%90-%D7%A9%D7%9D-scaled.png"],
  [5, "קורקינט חשמלי", "CORTEZ NUX 48", "https://cortez.co.il/wp-content/uploads/2025/08/1-9.jpg"],
  [6, "קורקינט חשמלי", "CORTEZ EMOVE", "https://cortez.co.il/wp-content/uploads/2025/08/1-Recovered.jpg"],
  [7, "קורקינט חשמלי", "MAX 36", "https://cortez.co.il/wp-content/uploads/2025/08/max-36.jpg"],
  [8, "קורקינט חשמלי", "GMAX", "https://cortez.co.il/wp-content/uploads/2025/12/WYJ_5309.jpg"],
  [9, "קורקינט חשמלי", "SHARK G2 PRO", "https://cortez.co.il/wp-content/uploads/2026/06/2BA3A34C-5779-4190-96F1-647DBEAA6F89.png"],
  [10, "קורקינט חשמלי", "SHARK MASTER", "https://cortez.co.il/wp-content/uploads/2026/06/ChatGPT-Image-Jun-9-2026-at-01_03_48-PM-4.png"],
  [11, "קורקינט חשמלי", "ECO XTREME TANK M41", "https://cortez.co.il/wp-content/uploads/2025/12/cortez-m41-black-1.jpg"],

  // אופניים חשמליים (21)
  [12, "אופניים חשמליים", "CORTEZ SPOT", "https://cortez.co.il/wp-content/uploads/2025/07/cortez-spot-red-1.jpg"],
  [13, "אופניים חשמליים", "CORTEZ SPORT RS", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-sport-rs-1.png"],
  [14, "אופניים חשמליים", "CORTEZ MAX 2 2027", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-max-2-2027-1.png"],
  [15, "אופניים חשמליים", "CORTEZ MAX 2 RS", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-max-2-rs-2.png"],
  [16, "אופניים חשמליים", "+MAX 2", "https://cortez.co.il/wp-content/uploads/2025/08/1.jpeg"],
  [17, "אופניים חשמליים", "CORTEZ MAX 3 2027", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-max-3-2027-1.png"],
  [18, "אופניים חשמליים", "CORTEZ MAX 4 2027", "https://cortez.co.il/wp-content/uploads/2026/09/cortez-max-4-2027-1.png"],
  [19, "אופניים חשמליים", "CORTEZ MAX 6 PREMIUM 2027", "https://cortez.co.il/wp-content/uploads/2025/08/max6-2027-03.jpg"],
  [20, "אופניים חשמליים", "CORTEZ MAX 9", "https://cortez.co.il/wp-content/uploads/2025/08/IMG_0415-scaled.jpg"],
  [21, "אופניים חשמליים", "CORTEZ GENERAL", "https://cortez.co.il/wp-content/uploads/2025/08/11.jpg"],
  [22, "אופניים חשמליים", "CORTEZ ALL STAR", "https://cortez.co.il/wp-content/uploads/2026/10/cortez-all-star-white.jpg"],
  [23, "אופניים חשמליים", "CORTEZ COPPER 12", "https://cortez.co.il/wp-content/uploads/2025/07/1.jpeg"],
  [24, "אופניים חשמליים", "CORTEZ COPPER 14", "https://cortez.co.il/wp-content/uploads/2025/07/1-1.jpeg"],
  [25, "אופניים חשמליים", "CORTEZ COPPER 16", "https://cortez.co.il/wp-content/uploads/2025/07/0Z4A8758.jpg"],
  [26, "אופניים חשמליים", "CORTEZ SUPRA 3", "https://cortez.co.il/wp-content/uploads/2025/08/A-18-scaled.jpg"],
  [27, "אופניים חשמליים", "CORTEZ SUPRA 4", "https://cortez.co.il/wp-content/uploads/2025/08/A-12-scaled.jpg"],
  [28, "אופניים חשמליים", "CORTEZ SUPRA 4 2027", "https://cortez.co.il/wp-content/uploads/2026/10/cortez-supra-4-2027-white-1.jpg"],
  [29, "אופניים חשמליים", "Black Mamba", "https://cortez.co.il/wp-content/uploads/2025/08/%D7%91%D7%9C%D7%90%D7%A7-%D7%9E%D7%9E%D7%91%D7%94-500-scaled.jpg"],
  [30, "אופניים חשמליים", "Black Mamba 3", "https://cortez.co.il/wp-content/uploads/2025/08/1-1.jpg"],
  [31, "אופניים חשמליים", "CORTEZ BLACK MAMBA 2027", "https://cortez.co.il/wp-content/uploads/2026/10/cortez-black-mamba-2027-white-1.jpg"],
  [32, "אופניים חשמליים", "CORTEZ BLACK MAMBA PREMIUM", "https://cortez.co.il/wp-content/uploads/2025/08/%D7%91%D7%9C%D7%90%D7%A7-%D7%9E%D7%9E%D7%91%D7%94-%D7%A4%D7%A8%D7%99%D7%9E%D7%99%D7%95%D7%9D-scaled.jpg"],
];

const seedTimestamp = "2026-01-01T08:00:00.000Z";

export const defaultCatalogModels: CatalogModel[] = catalogSeed.map(([index, device, name, imageUrl]) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  device,
  name,
  imageUrl,
  notes: "דגם רשמי מתוך קטלוג קורטז (cortez.co.il)",
  photos: [],
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
}));
