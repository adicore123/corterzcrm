import type { StudioConfig, StudioVariant } from "../../lib/validation/models";

export type Vec3 = [number, number, number];
export type CameraPose = { position: Vec3; target: Vec3 };
export type CameraMove = { from: CameraPose; to: CameraPose; start: number; duration: number };
export function createCameraMove(from: CameraPose, to: CameraPose, start: number, reducedMotion: boolean): CameraMove {
  return { from: structuredClone(from), to: structuredClone(to), start, duration: reducedMotion ? 0 : 1000 };
}
export function cameraAt(move: CameraMove, now: number): CameraPose {
  const t = move.duration === 0 ? 1 : Math.max(0, Math.min(1, (now - move.start) / move.duration));
  if (t <= 0) return structuredClone(move.from);
  if (t >= 1) return structuredClone(move.to);
  const eased = t * t * (3 - 2 * t);
  const lerp = (a: Vec3, b: Vec3): Vec3 => a.map((value, i) => value + (b[i] - value) * eased) as Vec3;
  const target = lerp(move.from.target, move.to.target);
  const offset = (pose: CameraPose) => pose.position.map((value, i) => value - pose.target[i]) as Vec3;
  const from = offset(move.from), to = offset(move.to);
  const aLength = Math.hypot(...from), bLength = Math.hypot(...to);
  if (aLength < .0001 || bLength < .0001) return { position: lerp(move.from.position, move.to.position), target };
  const u = from.map((v) => v / aLength) as Vec3, v = to.map((n) => n / bLength) as Vec3;
  const dot = Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i], 0)));
  let perpendicular = v.map((n, i) => n - u[i] * dot) as Vec3;
  let perpendicularLength = Math.hypot(...perpendicular);
  if (perpendicularLength < .0001) {
    const axis: Vec3 = Math.abs(u[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    perpendicular = [u[1] * axis[2] - u[2] * axis[1], u[2] * axis[0] - u[0] * axis[2], u[0] * axis[1] - u[1] * axis[0]];
    perpendicularLength = Math.hypot(...perpendicular);
  }
  const angle = Math.acos(dot) * eased, distance = aLength + (bLength - aLength) * eased;
  const direction = u.map((n, i) => n * Math.cos(angle) + perpendicular[i] / perpendicularLength * Math.sin(angle)) as Vec3;
  return { position: target.map((n, i) => n + direction[i] * distance) as Vec3, target };
}
export const studioViews: Record<string, CameraPose> = {
  signature: { position: [2, 1.1, 2.7], target: [0, 0, 0] },
  front: { position: [0, .45, 3.4], target: [0, 0, 0] },
  side: { position: [3.4, .45, 0], target: [0, 0, 0] },
  back: { position: [0, .45, -3.4], target: [0, 0, 0] },
  detail: { position: [.2, .35, 1.8], target: [0, .15, 0] },
  angle: { position: [-2, 1, 2.7], target: [0, 0, 0] },
};
export type TourState = { active: boolean; playing: boolean; index: number; total: number };
export const initialTour: TourState = { active: false, playing: false, index: 0, total: 0 };
type TourAction = { type: "start"; total: number } | { type: "pause" | "resume" | "next" | "previous" | "exit" | "tick" };
export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start": return action.total > 0 ? { active: true, playing: true, index: 0, total: action.total } : initialTour;
    case "exit": return initialTour;
    case "pause": return state.active ? { ...state, playing: false } : state;
    case "resume": return state.active ? { ...state, playing: true } : state;
    case "previous": return { ...state, index: Math.max(0, state.index - 1) };
    case "tick": if (!state.playing) return state;
    case "next": return state.index < state.total - 1 ? { ...state, index: state.index + 1 } : { ...state, playing: false };
  }
}
export function isScaleAccurate(size: Vec3, dimensions: StudioConfig["dimensions"]): boolean {
  return !!dimensions && [Math.abs(size[0] - dimensions.length) / dimensions.length, Math.abs(size[2] - dimensions.width) / dimensions.width, Math.abs(size[1] - dimensions.height) / dimensions.height].every((error) => Number.isFinite(error) && error < .12);
}
export type TourStep = { title: string; description: string; view?: string; featureIndex?: number; imageIndex?: number; durationMs?: number };
export function buildTour(model: { name: string; summary?: string; features?: { title: string; description: string }[]; studio?: StudioConfig }): TourStep[] {
  if (model.studio?.tour?.length) return model.studio.tour;
  const features = model.studio?.features?.length ? model.studio.features : model.features ?? [];
  return [{ title: model.name, description: model.summary || "הכירו את הדגם ואת הפרטים שמרכיבים אותו.", view: "signature", durationMs: 7000 }, ...features.slice(0, 4).map((feature, index) => ({ title: feature.title, description: feature.description, featureIndex: index, view: model.studio?.features?.[index]?.view ?? (index % 2 ? "angle" : "detail"), durationMs: 8000 }))];
}
export function resolveVariant(variants: StudioVariant[] | undefined, id: string | undefined) { return variants?.find((variant) => variant.id === id); }
export function studioShareParams(state: { variant?: string; view?: string; environment?: string; mode?: string; pose?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value) params.set(key, value);
  return params;
}
export function encodeStudioPose(pose: CameraPose): string { return [...pose.position, ...pose.target].map((number) => Number(number.toFixed(4))).join(","); }
export function decodeStudioPose(value?: string): CameraPose | undefined {
  if (!value || value.length > 200) return undefined;
  const numbers = value.split(",").map(Number);
  if (numbers.length !== 6 || numbers.some((number) => !Number.isFinite(number) || Math.abs(number) > 100)) return undefined;
  const distance = Math.hypot(numbers[0] - numbers[3], numbers[1] - numbers[4], numbers[2] - numbers[5]);
  return distance >= .5 && distance <= 10 ? { position: numbers.slice(0, 3) as Vec3, target: numbers.slice(3) as Vec3 } : undefined;
}
