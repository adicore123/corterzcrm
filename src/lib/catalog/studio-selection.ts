import { decodeStudioPose, encodeStudioPose } from "../../components/catalog/studio-state";
export function readStudioSelection(query: Record<string, string | string[] | undefined>) {
  const text = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const identifier = (key: string) => /^[a-zA-Z0-9_-]{1,96}$/.test(text(key) ?? "") ? text(key) : undefined;
  const pose = decodeStudioPose(text("pose"));
  return { variant: identifier("variant"), view: identifier("view"), pose: pose ? encodeStudioPose(pose) : undefined, environment: ["day", "night", "gallery"].includes(text("environment") ?? "") ? text("environment") : undefined, mode: ["studio", "photos", "3d"].includes(text("mode") ?? "") ? text("mode") : undefined };
}
