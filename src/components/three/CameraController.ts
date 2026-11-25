import * as THREE from "three";
import { SCENE_CONFIG } from "./scene.config";

export type CoastalCameraPreset = "wide" | "closeup" | "sunset";

export interface CameraControllerHandle {
  camera: THREE.PerspectiveCamera;
  setPointerOffset: (nx: number, ny: number) => void;
  addDragOffset: (dx: number, dy: number) => void;
  notifyUserInteraction: () => void;
  setScrollProgress: (progress: number) => void;
  setPreset: (preset: CoastalCameraPreset) => void;
  resize: (width: number, height: number, isMobile: boolean) => void;
  tick: (deltaSec: number, elapsedSec: number, animated: boolean) => void;
}

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Intentional 48mm full-frame equivalent cinematic camera controller (V3).
 * Features:
 * - ≤ 2.2s opening glide from over the sea down to the bike (skippable on any touch)
 * - 1.45s eased arc transitions between presets ("wide", "closeup", "sunset")
 * - Azimuth clamped to ±18° for Path 2 cutout rig so the plane is never seen edge-on
 * - Elevation clamped above the sand terrain (never dips below sand)
 * - Slow idle auto-orbit after 6s without input (stops on touch or motion pause)
 * - Portrait-first phone framing (horizon in upper third, bike in lower half)
 */
export function createCameraController(
  width: number,
  height: number,
  initialMobile: boolean,
  centerStage = false,
): CameraControllerHandle {
  let isMobile = initialMobile;
  let isPortrait = height > width || initialMobile;
  let activePreset: CoastalCameraPreset = "wide";

  const camera = new THREE.PerspectiveCamera(
    isPortrait ? SCENE_CONFIG.camera.mobilePortraitFov : SCENE_CONFIG.camera.desktopFov,
    Math.max(width, 1) / Math.max(height, 1),
    SCENE_CONFIG.camera.near,
    SCENE_CONFIG.camera.far,
  );

  const pointer = { x: 0, y: 0 };
  const smoothedPointer = { x: 0, y: 0 };
  const drag = { x: 0, y: 0 };
  const smoothedDrag = { x: 0, y: 0 };
  let scrollProgress = 0;
  let smoothedScroll = 0;

  let introSkipped = false;
  let lastInteractionSec = 0;
  let totalElapsedSec = 0;

  // Arc preset transition state
  const fromPosOffset = new THREE.Vector3(0, 0, 0);
  const fromLookOffset = new THREE.Vector3(0, 0, 0);
  const currentPosOffset = new THREE.Vector3(0, 0, 0);
  const currentLookOffset = new THREE.Vector3(0, 0, 0);
  const targetPosOffset = new THREE.Vector3(0, 0, 0);
  const targetLookOffset = new THREE.Vector3(0, 0, 0);
  let presetTransitionElapsed: number = SCENE_CONFIG.camera.presetTransitionSec;

  const computePresetTarget = (preset: CoastalCameraPreset) => {
    if (preset === "closeup") {
      // Shallow depth-of-field close-up on the bike frame, tires & sand tracks
      targetPosOffset.set(centerStage || isPortrait ? 0.0 : -0.36, -0.14, -1.35);
      targetLookOffset.set(centerStage || isPortrait ? 0.0 : -0.34, -0.04, 0.35);
    } else if (preset === "sunset") {
      // Westward sun-and-sea angle within the ±18° safe cutout azimuth cone
      targetPosOffset.set(0.42, -0.05, -0.28);
      targetLookOffset.set(-0.26, 0.08, -0.35);
    } else {
      targetPosOffset.set(0, 0, 0);
      targetLookOffset.set(0, 0, 0);
    }
  };

  const computeBasePose = (portrait: boolean, introProgress: number) => {
    const t = introSkipped ? 1 : easeInOutCubic(Math.min(1, introProgress));
    // Wow entrance: glides down from over the water sensitivity arc into the settled hero frame
    const introZ = (1 - t) * 0.68;
    const introY = (1 - t) * 0.22;
    const introX = (1 - t) * -0.18;

    if (portrait || centerStage) {
      // Portrait-first phone composition: horizon in upper third, bike framed in lower half
      return {
        pos: new THREE.Vector3(0.0 + introX, 1.34 + introY, (portrait ? 6.35 : 6.10) + introZ),
        look: new THREE.Vector3(0.0, 0.96, 0.36),
      };
    }
    // Desktop RTL split: right side holds the floating quote scrim; left 68% frames the bike, sun & sea
    return {
      pos: new THREE.Vector3(-0.32 + introX, 1.38 + introY, 6.50 + introZ),
      look: new THREE.Vector3(-0.38, 0.96, 0.42),
    };
  };

  const initial = computeBasePose(isPortrait, 1);
  camera.position.copy(initial.pos);
  camera.lookAt(initial.look);

  return {
    camera,
    notifyUserInteraction() {
      introSkipped = true;
      lastInteractionSec = totalElapsedSec;
    },
    setPointerOffset(nx: number, ny: number) {
      pointer.x = Math.max(-1, Math.min(1, nx));
      pointer.y = Math.max(-1, Math.min(1, ny));
    },
    addDragOffset(dx: number, dy: number) {
      introSkipped = true;
      lastInteractionSec = totalElapsedSec;
      // Strict ±18° azimuth limit (at z distance ~4.6m, max horizontal offset is ±1.15m)
      drag.x = Math.max(-0.95, Math.min(0.95, drag.x + dx));
      drag.y = Math.max(-0.32, Math.min(0.48, drag.y + dy));
    },
    setScrollProgress(progress: number) {
      scrollProgress = Math.max(0, Math.min(1, progress));
    },
    setPreset(preset: CoastalCameraPreset) {
      activePreset = preset;
      introSkipped = true;
      lastInteractionSec = totalElapsedSec;
      fromPosOffset.copy(currentPosOffset);
      fromLookOffset.copy(currentLookOffset);
      computePresetTarget(activePreset);
      presetTransitionElapsed = 0;
      drag.x = 0;
      drag.y = 0;
    },
    resize(w: number, h: number, mobile: boolean) {
      isMobile = mobile;
      isPortrait = h > w || isMobile;
      camera.fov = isPortrait ? SCENE_CONFIG.camera.mobilePortraitFov : SCENE_CONFIG.camera.desktopFov;
      camera.aspect = Math.max(w, 1) / Math.max(h, 1);
      camera.updateProjectionMatrix();
      computePresetTarget(activePreset);
    },
    tick(deltaSec: number, elapsedSec: number, animated: boolean) {
      totalElapsedSec = elapsedSec;
      const dt = Math.min(deltaSec, 0.1);
      const damping = 1 - Math.exp(-dt * 5.2);

      smoothedPointer.x += (pointer.x - smoothedPointer.x) * damping;
      smoothedPointer.y += (pointer.y - smoothedPointer.y) * damping;
      smoothedDrag.x += (drag.x - smoothedDrag.x) * damping;
      smoothedDrag.y += (drag.y - smoothedDrag.y) * damping;
      smoothedScroll += (scrollProgress - smoothedScroll) * damping;

      // Eased 1.45s arc transition between presets (adds a gentle vertical/lateral arc midpoint)
      if (presetTransitionElapsed < SCENE_CONFIG.camera.presetTransitionSec) {
        presetTransitionElapsed = Math.min(
          SCENE_CONFIG.camera.presetTransitionSec,
          presetTransitionElapsed + dt,
        );
        const rawT = presetTransitionElapsed / SCENE_CONFIG.camera.presetTransitionSec;
        const easedT = easeInOutCubic(rawT);
        const arcLift = Math.sin(rawT * Math.PI) * 0.08;
        currentPosOffset.lerpVectors(fromPosOffset, targetPosOffset, easedT);
        currentPosOffset.y += arcLift;
        currentLookOffset.lerpVectors(fromLookOffset, targetLookOffset, easedT);
      } else {
        currentPosOffset.copy(targetPosOffset);
        currentLookOffset.copy(targetLookOffset);
      }

      const introProgress = animated
        ? elapsedSec / SCENE_CONFIG.camera.entranceDurationSec
        : 1;
      const base = computeBasePose(isPortrait, introProgress);

      // Slow idle auto-orbit after 6.0s without user input (freezes when motion is paused)
      const idleDuration = elapsedSec - lastInteractionSec;
      const idleFactor = animated && idleDuration > SCENE_CONFIG.camera.idleAutoOrbitDelaySec
        ? Math.min(1, (idleDuration - SCENE_CONFIG.camera.idleAutoOrbitDelaySec) / 2.5)
        : 0;
      const idlePhase = Math.max(0, idleDuration - SCENE_CONFIG.camera.idleAutoOrbitDelaySec)
        * SCENE_CONFIG.camera.idleAutoOrbitSpeedRad;
      const idleOrbitX = Math.sin(idlePhase) * 0.24 * idleFactor;
      const idleOrbitY = Math.cos(idlePhase * 0.7) * 0.025 * idleFactor;

      const ambientSwayX = animated ? Math.sin(elapsedSec * 0.26) * 0.035 : 0;
      const ambientSwayY = animated ? Math.cos(elapsedSec * 0.20) * 0.014 : 0;

      const nextX = base.pos.x + currentPosOffset.x + smoothedPointer.x * 0.18 + smoothedDrag.x * 0.78 + idleOrbitX + ambientSwayX;
      // Never allow camera to dip below the sand safety floor (0.58m world Y)
      const nextY = Math.max(
        0.58,
        base.pos.y + currentPosOffset.y + smoothedPointer.y * 0.07 + smoothedDrag.y * 0.30 + smoothedScroll * 0.14 + idleOrbitY + ambientSwayY,
      );
      const nextZ = base.pos.z + currentPosOffset.z - smoothedScroll * 0.24;

      camera.position.set(nextX, nextY, nextZ);
      camera.lookAt(
        base.look.x + currentLookOffset.x + smoothedPointer.x * 0.06 - smoothedDrag.x * 0.16 - idleOrbitX * 0.22,
        base.look.y + currentLookOffset.y + smoothedPointer.y * 0.03 - smoothedDrag.y * 0.06 - smoothedScroll * 0.04,
        base.look.z + currentLookOffset.z,
      );
    },
  };
}
