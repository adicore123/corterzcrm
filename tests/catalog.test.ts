import assert from "node:assert/strict";
import test from "node:test";
import { defaultCatalogModels } from "../src/lib/json-db/cortez-catalog";
import { mergeWithDefaultCatalog } from "../src/lib/json-db/queries";
import { modelInput } from "../src/lib/validation/models";
import { publicCatalogModels } from "../src/lib/catalog/public-model";
import { extractKeySpecs, filterCatalog, getProductFeatures, parseMetrics } from "../src/components/catalog/catalog-utils";
import { readCatalogState, writeCatalogState } from "../src/lib/catalog/catalog-state";

const base = defaultCatalogModels[0];

test("catalog URL state round-trips combined filters and preserves legacy model links", () => {
  const query = writeCatalogState(new URLSearchParams("model=legacy"), { category: base.device, search: "MAX", fits: ["hydraulic", "long-range"], maxPrice: 5000, sort: "price-asc", compareIds: [base.id] });
  assert.equal(query.get("model"), "legacy");
  assert.deepEqual(readCatalogState(query), { category: base.device, search: "MAX", fits: ["hydraulic", "long-range"], maxPrice: 5000, sort: "price-asc", compareIds: [base.id] });
  assert.equal(readCatalogState(new URLSearchParams("budget=NaN&category=invalid&fit=invalid")).maxPrice, 0);
});

test("public catalog excludes unpublished records and internal notes from serialized data", () => {
  const list = publicCatalogModels([{ ...base, notes: "SECRET SERVICE NOTE" }, { ...base, id: "hidden", published: false }]);
  assert.equal(list.length, 1);
  assert.equal(JSON.stringify(list).includes("SECRET"), false);
});

test("explicit empty galleries and specs survive seed enrichment", () => {
  const merged = mergeWithDefaultCatalog([{ ...base, specs: [], galleryUrls: [], summary: "", published: false }]);
  const model = merged.find((item) => item.id === base.id)!;
  assert.deepEqual(model.specs, []);
  assert.deepEqual(model.galleryUrls, []);
  assert.equal(model.summary, "");
  assert.equal(model.published, false);
});

test("deleted models are not resurrected by seed enrichment", () => {
  assert.deepEqual(mergeWithDefaultCatalog([]), []);
  const list = mergeWithDefaultCatalog([{ ...base }]);
  assert.equal(list.length, 1);
});

test("catalog combines fit filters, budget and category and does not search private notes", () => {
  const suitable = { ...base, id: "yes", notes: "private-secret", msrp: 3000, specs: [
    { label: "טווח", value: "עד 60 ק״מ" }, { label: "שיכוך", value: "מלא" },
  ] };
  const shortRange = { ...suitable, id: "no", specs: [{ label: "טווח", value: "30 ק״מ" }] };
  assert.deepEqual(filterCatalog([suitable, shortRange], { fits: ["long-range", "full-susp"], maxPrice: 3500 }).map((m) => m.id), ["yes"]);
  assert.equal(filterCatalog([suitable], { search: "private-secret" }).length, 0);
  assert.equal(filterCatalog([suitable], { maxPrice: 2000 }).length, 0);
});

test("a brake brand alone does not establish hydraulic brakes; unknown speed stays unknown", () => {
  const metrics = parseMetrics({ ...base, summary: "", specs: [{ label: "בלמים", value: "Shimano" }] });
  assert.equal(metrics.hasHydraulicBrakes, false);
  assert.equal(metrics.speedKmh, null);
});

test("structured verified metrics take precedence and media schema rejects unsafe URLs", () => {
  const parsed = modelInput.parse({ device: base.device, name: base.name, notes: "", metrics: { rangeKm: 42, speedKmh: 20 }, model3dUrl: "https://example.com/bike.glb", published: false });
  assert.equal(parseMetrics({ ...base, ...parsed }).rangeKm, 42);
  assert.equal(parseMetrics({ ...base, ...parsed }).speedKmh, 20);
  assert.equal(modelInput.safeParse({ ...parsed, model3dUrl: "javascript:alert(1)" }).success, false);
});

test("explicit unknown metrics do not fall back to legacy marketing text", () => {
  const model = { ...base, metrics: { rangeKm: null, speedKmh: null } };
  assert.equal(parseMetrics(model).rangeKm, null);
  assert.equal(extractKeySpecs(model).range, undefined);
  assert.equal(extractKeySpecs(model).speed, undefined);
});

test("feature explanations retain original component values and support authored content", () => {
  const features = getProductFeatures(base);
  assert.ok(features.some((feature) => feature.description.includes("36V/10.4Ah") && feature.description.includes("Wh")));
  const authored = [{ title: "בדיקה", description: "תיאור מאומת" }];
  assert.deepEqual(getProductFeatures({ ...base, features: authored }), authored);
});
