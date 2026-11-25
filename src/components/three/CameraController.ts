import * as THREE from "three";

export type CoastalCameraPreset = "wide" | "closeup" | "sunset";

export interface CameraControllerHandle {
  camera: THREE.PerspectiveCamera;
  setPointerOffset: (nx: number, ny: number) => void;
  addDragOffset: (dx: number, dy: number) => void;
  setScrollProgress: (progress: number) => void;
  setPreset: (preset: CoastalCameraPreset) => void;
  resize: (width: number, height: number, isMobile: boolean) => void;
  tick: (deltaSec: number, elapsedSec: number, animated: boolean) => void;
}

/**
 * Intentional 48mm full-frame equivalent cinematic camera controller.
 * Supports interactive camera angle presets ("wide", "closeup", "sunset"),
 * drag-to-orbit parallax, desktop RTL split vs centered showroom framing,
 * and gentle damped environmental motion.
 */
export function createCameraController(
  width: number,
  height: number,
  initialMobile: boolean,
  centerStage = false,
): CameraControllerHandle {
  let isMobile = initialMobile;
  let activePreset: CoastalCameraPreset = "wide";

  const camera = new THREE.PerspectiveCamera(
    isMobile ? 33 : 28,
    Math.max(width, 1) / Math.max(height, 1),
    0.1,
    520,
  );

  const pointer = { x: 0, y: 0 };
  const smoothedPointer = { x: 0, y: 0 };
  const drag = { x: 0, y: 0 };
  const smoothedDrag = { x: 0, y: 0 };
  let scrollProgress = 0;
  let smoothedScroll = 0;

  const presetValues = {
    posOffset: new THREE.Vector3(0, 0, 0),
    lookOffset: new THREE.Vector3(0, 0, 0),
  };
  const targetPresetValues = {
    posOffset: new THREE.Vector3(0, 0, 0),
    lookOffset: new THREE.Vector3(0, 0, 0),
  };

  const updatePresetTargets = (preset: CoastalCameraPreset) => {
    if (preset === "closeup") {
      targetPresetValues.posOffset.set(centerStage ? 0.0 : -0.35, -0.10, -1.25);
      targetPresetValues.lookOffset.set(centerStage ? 0.0 : -0.32, -0.02, 0.35);
    } else if (preset === "sunset") {
      targetPresetValues.posOffset.set(0.65, -0.06, -0.35);
      targetPresetValues.lookOffset.set(-0.38, 0.12, -0.45);
    } else {
      targetPresetValues.posOffset.set(0, 0, 0);
      targetPresetValues.lookOffset.set(0, 0, 0);
    }
  };

  const computeBasePose = (mobile: boolean, introProgress: number) => {
    const introEase = 1 - Math.pow(1 - Math.min(1, introProgress), 3);
    const introZ = (1 - introEase) * 0.42;
    const introY = (1 - introEase) * 0.07;

    if (mobile || centerStage) {
      return {
        pos: new THREE.Vector3(0.0, 1.36 + introY, (mobile ? 6.45 : 6.15) + introZ),
        look: new THREE.Vector3(0.0, 0.94, 0.35),
      };
    }
    // Desktop RTL Hero: product stands at x = -1.08 on the open left-center beach terrace,
    // while the visible sun orb radiates at azimuth -11.5 deg above the sea horizon
    return {
      pos: new THREE.Vector3(-0.32, 1.38 + introY, 6.55 + introZ),
      look: new THREE.Vector3(-0.38, 0.96, 0.42),
    };
  };

  const initial = computeBasePose(isMobile, 1);
  camera.position.copy(initial.pos);
  camera.lookAt(initial.look);

  return {
    camera,
    setPointerOffset(nx: number, ny: number) {
      pointer.x = Math.max(-1, Math.min(1, nx));
      pointer.y = Math.max(-1, Math.min(1, ny));
    },
    addDragOffset(dx: number, dy: number) {
      drag.x = Math.max(-1.35, Math.min(1.35, drag.x + dx));
      drag.y = Math.max(-0.45, Math.min(0.55, drag.y + dy));
    },
    setScrollProgress(progress: number) {
      scrollProgress = Math.max(0, Math.min(1, progress));
    },
    setPreset(preset: CoastalCameraPreset) {
      activePreset = preset;
      updatePresetTargets(activePreset);
      drag.x = 0;
      drag.y = 0;
    },
    resize(w: number, h: number, mobile: boolean) {
      isMobile = mobile;
      camera.fov = mobile ? 33 : 28;
      camera.aspect = Math.max(w, 1) / Math.max(h, 1);
      camera.updateProjectionMatrix();
      updatePresetTargets(activePreset);
    },
    tick(deltaSec: number, elapsedSec: number, animated: boolean) {
      const damping = 1 - Math.exp(-Math.min(deltaSec, 0.1) * 5.2);
      smoothedPointer.x += (pointer.x - smoothedPointer.x) * damping;
      smoothedPointer.y += (pointer.y - smoothedPointer.y) * damping;
      smoothedDrag.x += (drag.x - smoothedDrag.x) * damping;
      smoothedDrag.y += (drag.y - smoothedDrag.y) * damping;
      smoothedScroll += (scrollProgress - smoothedScroll) * damping;

      presetValues.posOffset.lerp(targetPresetValues.posOffset, damping);
      presetValues.lookOffset.lerp(targetPresetValues.lookOffset, damping);

      const base = computeBasePose(isMobile, animated ? elapsedSec / 2.2 : 1);
      const swayX = animated ? Math.sin(elapsedSec * 0.28) * 0.045 : 0;
      const swayY = animated ? Math.cos(elapsedSec * 0.22) * 0.018 : 0;

      camera.position.set(
        base.pos.x + presetValues.posOffset.x + smoothedPointer.x * 0.24 + smoothedDrag.x * 0.85 + swayX,
        base.pos.y + presetValues.posOffset.y + smoothedPointer.y * 0.09 + smoothedDrag.y * 0.35 + smoothedScroll * 0.16 + swayY,
        base.pos.z + presetValues.posOffset.z - smoothedScroll * 0.26,
      );
      camera.lookAt(
        base.look.x + presetValues.lookOffset.x + smoothedPointer.x * 0.08 - smoothedDrag.x * 0.18,
        base.look.y + presetValues.lookOffset.y + smoothedPointer.y * 0.04 - smoothedDrag.y * 0.08 - smoothedScroll * 0.05,
        base.look.z + presetValues.lookOffset.z,
      );
    },
  };
}
