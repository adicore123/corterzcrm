import type { CatalogModel } from "../validation/models";

/** Explicit allowlist: never serialize service notes into a public React payload. */
export function publicCatalogModels(models: CatalogModel[]): CatalogModel[] {
  return models.filter((model) => model.published !== false).map((model) => ({
    id: model.id, name: model.name, device: model.device, notes: "",
    createdAt: model.createdAt, updatedAt: model.updatedAt, photos: model.photos.map((photo) => ({ ...photo, name: "product.webp" })),
    imageUrl: model.imageUrl, galleryUrls: model.galleryUrls, summary: model.summary,
    specs: model.specs, msrp: model.msrp, productUrl: model.productUrl,
    model3dUrl: model.model3dUrl, videoUrl: model.videoUrl,
    publicDescription: model.publicDescription, metrics: model.metrics, features: model.features,
    dimensions: model.dimensions, foldedDimensions: model.foldedDimensions,
    studio: model.studio ? {
      assetVerified: model.studio.assetVerified, scaleVerified: model.studio.scaleVerified,
      verifiedModel3dUrl: model.studio.verifiedModel3dUrl,
      verifiedDimensions: model.studio.verifiedDimensions,
      usdzUrl: model.studio.usdzUrl, arEnabled: model.studio.arEnabled, dimensions: model.studio.dimensions,
      cameras: model.studio.cameras, features: model.studio.features, tour: model.studio.tour,
      actions: model.studio.actions, variants: model.studio.variants,
    } : undefined,
  }));
}
