import * as THREE from "three";

export interface CameraControllerHandle {
  camera: THREE.PerspectiveCamera;
  setPointerOffset: (nx: number, ny: number) => void;
  setScrollProgress: (progress: number) => void;
  resize: (width: number, height: number, isMobile: boolean) => void;
  tick: (deltaSec: number, elapsedSec: number, animated: boolean) => void;
}

/**
 * Intentional 48mm full-frame equivalent cinematic camera controller.
 * Provides separate desktop (RTL split hero) and mobile compositions,
 * gentle opening camera movement, and subtle damped environmental parallax without hijacking scroll.
 */
export function createCameraController(
  width: number,
  height: number,
  initialMobile: boolean,
): CameraControllerHandle {
  let isMobile = initialMobile;
  // 28 deg vertical FOV ~= 48mm full-frame equivalent lens on desktop; 33 deg on mobile
  const camera = new THREE.PerspectiveCamera(
    isMobile ? 33 : 28,
    Math.max(width, 1) / Math.max(height, 1),
    0.1,
    520,
  );

  const pointer = { x: 0, y: 0 };
  const smoothedPointer = { x: 0, y: 0 };
  let scrollProgress = 0;
  let smoothedScroll = 0;

  const computeBasePose = (mobile: boolean, introProgress: number) => {
    // Intro dolly smoothly settles over first 2.2 seconds
    const introEase = 1 - Math.pow(1 - Math.min(1, introProgress), 3);
    const introZ = (1 - introEase) * 0.45;
    const introY = (1 - introEase) * 0.08;

    if (mobile) {
      return {
        pos: new THREE.Vector3(0.0, 1.38 + introY, 6.65 + introZ),
        look: new THREE.Vector3(0.0, 0.95, 0.4),
      };
    }
    // Desktop RTL: camera frames the product on the left side (-X) while leaving right side (+X) open for the Hebrew hero card
    return {
      pos: new THREE.Vector3(-0.35, 1.42 + introY, 6.75 + introZ),
      look: new THREE.Vector3(-0.42, 1.02, 0.5),
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
    setScrollProgress(progress: number) {
      scrollProgress = Math.max(0, Math.min(1, progress));
    },
    resize(w: number, h: number, mobile: boolean) {
      isMobile = mobile;
      camera.fov = mobile ? 33 : 28;
      camera.aspect = Math.max(w, 1) / Math.max(h, 1);
      camera.updateProjectionMatrix();
    },
    tick(deltaSec: number, elapsedSec: number, animated: boolean) {
      const damping = 1 - Math.exp(-Math.min(deltaSec, 0.1) * 4.5);
      smoothedPointer.x += (pointer.x - smoothedPointer.x) * damping;
      smoothedPointer.y += (pointer.y - smoothedPointer.y) * damping;
      smoothedScroll += (scrollProgress - smoothedScroll) * damping;

      const base = computeBasePose(isMobile, animated ? elapsedSec / 2.2 : 1);
      const swayX = animated ? Math.sin(elapsedSec * 0.28) * 0.045 : 0;
      const swayY = animated ? Math.cos(elapsedSec * 0.22) * 0.018 : 0;

      camera.position.set(
        base.pos.x + smoothedPointer.x * 0.22 + swayX,
        base.pos.y + smoothedPointer.y * 0.08 + smoothedScroll * 0.18 + swayY,
        base.pos.z - smoothedScroll * 0.28,
      );
      camera.lookAt(
        base.look.x + smoothedPointer.x * 0.08,
        base.look.y + smoothedPointer.y * 0.04 - smoothedScroll * 0.06,
        base.look.z,
      );
    },
  };
}
