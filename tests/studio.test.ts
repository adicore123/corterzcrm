import assert from "node:assert/strict";
import test from "node:test";
import { cameraAt, createCameraMove, tourReducer, initialTour, buildTour, resolveVariant, studioShareParams, isScaleAccurate } from "../src/components/catalog/studio-state";
import { modelInput } from "../src/lib/validation/models";

test("camera moves interpolate exactly, respect reduced motion and can be interrupted", () => {
  const a = { position: [0, 0, 6] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
  const b = { position: [3, 1, 4] as [number, number, number], target: [1, 0, 0] as [number, number, number] };
  const move = createCameraMove(a, b, 100, false);
  assert.deepEqual(cameraAt(move, 100), a);
  assert.deepEqual(cameraAt(move, 1500), b);
  const halfway = cameraAt(move, 700);
  assert.notDeepEqual(halfway, a);
  assert.deepEqual(cameraAt(createCameraMove(halfway, a, 700, true), 700), a);
});

test("camera travels around the product rather than through it between opposing views", () => {
  const move = createCameraMove({ position: [0, 0, 6], target: [0, 0, 0] }, { position: [0, 0, -6], target: [0, 0, 0] }, 0, false);
  assert.ok(Math.hypot(...cameraAt(move, 500).position) > 5.99);
  assert.equal(isScaleAccurate([1.2, 1.1, .5], { length: 1.2, width: .5, height: 1.1 }), true);
  assert.equal(isScaleAccurate([1200, 1100, 500], { length: 1.2, width: .5, height: 1.1 }), false);
});

test("tour lifecycle pauses, resumes, steps backwards and exits without stale timers", () => {
  let state = tourReducer(initialTour, { type: "start", total: 3 });
  assert.equal(state.playing, true);
  state = tourReducer(state, { type: "pause" });
  assert.equal(tourReducer(state, { type: "tick" }).index, 0);
  state = tourReducer(state, { type: "next" });
  assert.equal(state.index, 1);
  state = tourReducer(state, { type: "previous" });
  assert.equal(state.index, 0);
  assert.deepEqual(tourReducer(state, { type: "exit" }), initialTour);
});

test("tour uses authored content or existing verified features; invalid variants cannot be shared", () => {
  const steps = buildTour({ name: "A", features: [{ title: "סוללה", description: "48V" }] });
  assert.equal(steps.length, 2);
  const variants = [{ id: "black", title: "שחור", color: "#111111" }];
  assert.equal(resolveVariant(variants, "invented"), undefined);
  const params = studioShareParams({ variant: "black", view: "front", environment: "night" });
  assert.equal(params.get("variant"), "black");
  assert.equal(params.get("environment"), "night");
});

test("studio config validates anchors and supports named actions and actual variants", () => {
  const input = { name: "A", device: "קורקינט חשמלי", notes: "", studio: {
    assetVerified: true, scaleVerified: true,
    dimensions: { length: 1.2, width: 0.5, height: 1.1 },
    features: [{ title: "בלם", description: "מאומת", nodePath: "0/1", point: [0, 0, 0] }],
    actions: [{ id: "fold", title: "קיפול", clip: "Fold" }],
    variants: [{ id: "black", title: "שחור", color: "#111111", sku: "A-BLK", price: 3200 }],
  } };
  assert.equal(modelInput.safeParse(input).success, true);
  assert.equal(modelInput.safeParse({ ...input, studio: { ...input.studio, dimensions: { length: -1, width: 1, height: 1 } } }).success, false);
});
