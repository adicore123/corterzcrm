import assert from "node:assert/strict";
import test from "node:test";
import { resolveProposalMedia } from "../src/lib/quotes/proposal-media";

test("proposal uses real geometry only when its asset and scale are verified", () => {
  const model = {
    name: "CORTEZ 10X",
    imageUrl: "https://example.com/10x.jpg",
    model3dUrl: "https://example.com/10x.glb",
    studio: { assetVerified: true, scaleVerified: true, verifiedModel3dUrl: "https://example.com/10x.glb", dimensions: { length: 2, width: 1, height: 1 }, verifiedDimensions: { length: 2, width: 1, height: 1 } },
  };
  assert.deepEqual(resolveProposalMedia(model), {
    kind: "3d", url: model.model3dUrl, poster: model.imageUrl,
  });
  assert.equal(resolveProposalMedia({ ...model, studio: { assetVerified: false, scaleVerified: true } }).kind, "photo");
  assert.equal(resolveProposalMedia({ ...model, studio: { assetVerified: true, scaleVerified: false } }).kind, "photo");
  assert.equal(resolveProposalMedia({ ...model, model3dUrl: "https://example.com/replacement.glb" }).kind, "photo");
  assert.equal(resolveProposalMedia({ ...model, studio: { ...model.studio, dimensions: undefined } }).kind, "photo");
  assert.equal(resolveProposalMedia({ ...model, studio: { ...model.studio, dimensions: { length: 3, width: 1, height: 1 } } }).kind, "photo");
  assert.equal(resolveProposalMedia({ ...model, model3dUrl: "" }).kind, "photo");
});
