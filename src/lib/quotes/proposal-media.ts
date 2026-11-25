import type { CatalogModel } from "../validation/models";

type ProposalModel = Pick<CatalogModel, "imageUrl" | "model3dUrl" | "studio">;

export type ProposalMedia =
  | { kind: "3d"; url: string; poster?: string }
  | { kind: "photo"; poster?: string };

export function resolveProposalMedia(model: ProposalModel): ProposalMedia {
  const poster = model.imageUrl || undefined;
  const dimensions = model.studio?.dimensions;
  const verifiedDimensions = model.studio?.verifiedDimensions;
  const scaleMatches = !!dimensions && !!verifiedDimensions &&
    dimensions.length === verifiedDimensions.length && dimensions.width === verifiedDimensions.width && dimensions.height === verifiedDimensions.height;
  if (model.model3dUrl && model.studio?.assetVerified && model.studio.scaleVerified && scaleMatches && model.studio.verifiedModel3dUrl === model.model3dUrl) {
    return { kind: "3d", url: model.model3dUrl, poster };
  }
  return { kind: "photo", poster };
}
