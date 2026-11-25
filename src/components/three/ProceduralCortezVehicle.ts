import * as THREE from "three";

export interface ProceduralVehicleOptions {
  isScooter: boolean;
  primaryColorHex?: string;
  accentColorHex?: string;
}

/**
 * Generates a procedural 3D bump/roughness normal texture for fat-tire rubber treads.
 */
function createTireTreadTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 128);

  // Herringbone fat-tire lugs
  for (let x = 0; x < 256; x += 16) {
    for (let y = 12; y < 116; y += 22) {
      ctx.fillStyle = "#a8a8ff";
      ctx.fillRect(x + 2, y + 2, 10, 14);
      ctx.fillStyle = "#5858ff";
      ctx.fillRect(x + 12, y + 2, 2, 14);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 2);
  return tex;
}

/**
 * Builds a Physically Based Rendered (PBR) 3D CORTEZ E-Bike (MAX 2+ / Fat-Tire Series)
 * or E-Scooter with:
 * - Clearcoat metallic frame paint (MeshPhysicalMaterial: clearcoat 1.0, metalness 0.55, roughness 0.18)
 * - Matte grooved rubber fat tires (roughness 0.88, 3D knobby tread normal map)
 * - Brushed alloy / chrome suspension stanchions & perforated stainless-steel disc brake rotors
 * - Casts real-time dynamic 3D shadows onto the beach sand as the user rotates 360 deg
 */
export function createProceduralCortezVehicle(options: ProceduralVehicleOptions): {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  dispose: () => void;
} {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const treadNormalMap = createTireTreadTexture();
  if (treadNormalMap) disposables.push(treadNormalMap);

  // PBR Materials
  const framePaintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.primaryColorHex || "#15181c"),
    metalness: 0.52,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    reflectivity: 0.9,
  });

  const accentRedMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.accentColorHex || "#bf1619"),
    metalness: 0.38,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const tireRubberMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1a1c1e"),
    roughness: 0.88,
    metalness: 0.06,
    normalMap: treadNormalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });

  const alloyRimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1e2228"),
    metalness: 0.82,
    roughness: 0.24,
  });

  const chromeStanchionMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e8edf2"),
    metalness: 0.96,
    roughness: 0.07,
  });

  const brakeRotorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#cfd6dc"),
    metalness: 0.90,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });

  const saddleLeatherMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#18191c"),
    roughness: 0.72,
    metalness: 0.04,
  });

  const batteryCaseMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#121417"),
    metalness: 0.25,
    roughness: 0.32,
    clearcoat: 0.45,
  });

  const headlightGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#fff7df"),
  });

  disposables.push(
    framePaintMat,
    accentRedMat,
    tireRubberMat,
    alloyRimMat,
    chromeStanchionMat,
    brakeRotorMat,
    saddleLeatherMat,
    batteryCaseMat,
    headlightGlowMat,
  );

  const buildFatWheel = (radius: number, tubeRadius: number) => {
    const wheelGroup = new THREE.Group();

    // Matte rubber fat tire
    const tireGeo = new THREE.TorusGeometry(radius, tubeRadius, 20, 48);
    const tireMesh = new THREE.Mesh(tireGeo, tireRubberMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheelGroup.add(tireMesh);

    // Alloy outer rim barrel
    const rimGeo = new THREE.TorusGeometry(radius - tubeRadius * 0.72, tubeRadius * 0.34, 12, 36);
    const rimMesh = new THREE.Mesh(rimGeo, alloyRimMat);
    rimMesh.castShadow = true;
    wheelGroup.add(rimMesh);

    // CORTEZ red anodized rim stripe
    const stripeGeo = new THREE.TorusGeometry(radius - tubeRadius * 0.65, tubeRadius * 0.09, 8, 36);
    const stripeMesh = new THREE.Mesh(stripeGeo, accentRedMat);
    wheelGroup.add(stripeMesh);

    // 6-spoke cast magnesium star wheel + center hub
    const hubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.095, 18);
    hubGeo.rotateX(Math.PI / 2);
    const hubMesh = new THREE.Mesh(hubGeo, alloyRimMat);
    hubMesh.castShadow = true;
    wheelGroup.add(hubMesh);

    const spokeGeo = new THREE.BoxGeometry(0.024, radius - tubeRadius * 0.7, 0.022);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const spoke = new THREE.Mesh(spokeGeo, alloyRimMat);
      spoke.position.set(
        Math.cos(angle) * (radius - tubeRadius * 0.75) * 0.5,
        Math.sin(angle) * (radius - tubeRadius * 0.75) * 0.5,
        0,
      );
      spoke.rotation.z = angle - Math.PI / 2;
      spoke.castShadow = true;
      wheelGroup.add(spoke);
    }

    // Stainless steel disc brake rotor + red hydraulic caliper
    const rotorGeo = new THREE.RingGeometry(0.05, 0.115, 28);
    const rotorMesh = new THREE.Mesh(rotorGeo, brakeRotorMat);
    rotorMesh.position.z = 0.048;
    rotorMesh.castShadow = true;
    wheelGroup.add(rotorMesh);

    disposables.push(tireGeo, rimGeo, stripeGeo, hubGeo, spokeGeo, rotorGeo);
    return wheelGroup;
  };

  const addTube = (
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    r1: number,
    r2: number,
    mat: THREE.Material,
  ) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r2, r1, len, 16);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(p1).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geo);
    return mesh;
  };

  if (!options.isScooter) {
    // =========================================================================
    // CORTEZ MAX 2+ / FAT-TIRE FOLDING E-BIKE 3D PBR ASSEMBLY
    // Total wheelbase: ~1.14m, centered at (0, 0, 0), bottom of tires at y = 0
    // =========================================================================
    const wheelR = 0.255;
    const tireTubeR = 0.072;
    const wheelCenterY = wheelR + tireTubeR * 0.85;
    const rearX = -0.56;
    const frontX = 0.56;

    const rearWheel = buildFatWheel(wheelR, tireTubeR);
    rearWheel.position.set(rearX, wheelCenterY, 0);
    root.add(rearWheel);
    wheels.push(rearWheel);

    const frontWheel = buildFatWheel(wheelR, tireTubeR);
    frontWheel.position.set(frontX, wheelCenterY, 0);
    root.add(frontWheel);
    wheels.push(frontWheel);

    // Key frame nodes
    const bbPos = new THREE.Vector3(-0.12, wheelCenterY + 0.02, 0);
    const seatTubeTop = new THREE.Vector3(-0.24, wheelCenterY + 0.46, 0);
    const headTubeBottom = new THREE.Vector3(0.40, wheelCenterY + 0.36, 0);
    const headTubeTop = new THREE.Vector3(0.36, wheelCenterY + 0.55, 0);
    const mainFoldHinge = new THREE.Vector3(0.12, wheelCenterY + 0.23, 0);

    // Hydroformed main frame tube with CORTEZ red racing accent stripe
    addTube(bbPos, mainFoldHinge, 0.036, 0.042, framePaintMat);
    addTube(mainFoldHinge, headTubeBottom, 0.042, 0.038, framePaintMat);
    addTube(
      new THREE.Vector3(0.02, wheelCenterY + 0.19, 0.008),
      new THREE.Vector3(0.34, wheelCenterY + 0.34, 0.008),
      0.016,
      0.016,
      accentRedMat,
    );
    addTube(
      new THREE.Vector3(0.02, wheelCenterY + 0.19, -0.008),
      new THREE.Vector3(0.34, wheelCenterY + 0.34, -0.008),
      0.016,
      0.016,
      accentRedMat,
    );

    // Folding hinge box
    const hingeGeo = new THREE.BoxGeometry(0.075, 0.11, 0.088);
    const hingeMesh = new THREE.Mesh(hingeGeo, framePaintMat);
    hingeMesh.position.copy(mainFoldHinge);
    hingeMesh.rotation.z = 0.42;
    hingeMesh.castShadow = true;
    root.add(hingeMesh);
    disposables.push(hingeGeo);

    // Seat tube & Head tube
    addTube(bbPos, seatTubeTop, 0.028, 0.028, framePaintMat);
    addTube(headTubeBottom, headTubeTop, 0.032, 0.032, framePaintMat);

    // Dual chainstays & seatstays
    for (const zSide of [-0.062, 0.062]) {
      const rearDropout = new THREE.Vector3(rearX, wheelCenterY, zSide);
      addTube(new THREE.Vector3(bbPos.x, bbPos.y, zSide * 0.6), rearDropout, 0.016, 0.013, framePaintMat);
      addTube(new THREE.Vector3(seatTubeTop.x, seatTubeTop.y - 0.10, zSide * 0.5), rearDropout, 0.014, 0.012, framePaintMat);
    }

    // 48V / 15.6Ah External Lithium Battery Pack behind seat tube
    const battGeo = new THREE.BoxGeometry(0.115, 0.36, 0.125);
    const battMesh = new THREE.Mesh(battGeo, batteryCaseMat);
    battMesh.position.set(-0.27, wheelCenterY + 0.24, 0);
    battMesh.rotation.z = 0.24;
    battMesh.castShadow = true;
    root.add(battMesh);

    const battStripeGeo = new THREE.BoxGeometry(0.118, 0.08, 0.128);
    const battStripe = new THREE.Mesh(battStripeGeo, accentRedMat);
    battStripe.position.set(-0.29, wheelCenterY + 0.15, 0);
    battStripe.rotation.z = 0.24;
    root.add(battStripe);
    disposables.push(battGeo, battStripeGeo);

    // MOZO Front Suspension Fork (Lower outer legs + Chrome stanchions + Crown)
    for (const zSide of [-0.065, 0.065]) {
      const axlePos = new THREE.Vector3(frontX, wheelCenterY, zSide);
      const midFork = new THREE.Vector3(frontX - 0.07, wheelCenterY + 0.20, zSide);
      const crownSide = new THREE.Vector3(headTubeBottom.x + 0.02, headTubeBottom.y - 0.02, zSide);
      // Matte black lower suspension leg
      addTube(axlePos, midFork, 0.022, 0.024, framePaintMat);
      // Polished chrome upper stanchion
      addTube(midFork, crownSide, 0.016, 0.016, chromeStanchionMat);
    }
    // Fork crown bridge
    addTube(
      new THREE.Vector3(headTubeBottom.x + 0.02, headTubeBottom.y - 0.02, -0.07),
      new THREE.Vector3(headTubeBottom.x + 0.02, headTubeBottom.y - 0.02, 0.07),
      0.022,
      0.022,
      framePaintMat,
    );

    // Handlebar stem, bars, grips & LCD display
    const stemTop = new THREE.Vector3(0.31, wheelCenterY + 0.92, 0);
    addTube(headTubeTop, stemTop, 0.022, 0.019, framePaintMat);
    addTube(
      new THREE.Vector3(stemTop.x, stemTop.y, -0.28),
      new THREE.Vector3(stemTop.x, stemTop.y, 0.28),
      0.015,
      0.015,
      framePaintMat,
    );
    // Ergonomic rubber grips
    addTube(
      new THREE.Vector3(stemTop.x, stemTop.y, -0.34),
      new THREE.Vector3(stemTop.x, stemTop.y, -0.22),
      0.021,
      0.021,
      tireRubberMat,
    );
    addTube(
      new THREE.Vector3(stemTop.x, stemTop.y, 0.22),
      new THREE.Vector3(stemTop.x, stemTop.y, 0.34),
      0.021,
      0.021,
      tireRubberMat,
    );

    // LED Projector Headlight
    const lightBodyGeo = new THREE.CylinderGeometry(0.036, 0.032, 0.065, 16);
    lightBodyGeo.rotateZ(Math.PI / 2);
    const lightBody = new THREE.Mesh(lightBodyGeo, framePaintMat);
    lightBody.position.set(headTubeBottom.x + 0.08, headTubeBottom.y + 0.04, 0);
    lightBody.castShadow = true;
    root.add(lightBody);

    const lensGeo = new THREE.CircleGeometry(0.032, 16);
    lensGeo.rotateY(Math.PI / 2);
    const lensMesh = new THREE.Mesh(lensGeo, headlightGlowMat);
    lensMesh.position.set(headTubeBottom.x + 0.114, headTubeBottom.y + 0.04, 0);
    root.add(lensMesh);
    disposables.push(lightBodyGeo, lensGeo);

    // Seatpost & Ergonomic Contoured Saddle
    const saddlePos = new THREE.Vector3(-0.29, wheelCenterY + 0.64, 0);
    addTube(seatTubeTop, saddlePos, 0.018, 0.018, alloyRimMat);
    const saddleGeo = new THREE.BoxGeometry(0.26, 0.068, 0.17);
    const saddleMesh = new THREE.Mesh(saddleGeo, saddleLeatherMat);
    saddleMesh.position.copy(saddlePos);
    saddleMesh.castShadow = true;
    root.add(saddleMesh);
    disposables.push(saddleGeo);

    // Rear Cargo Rack & Full-Coverage Curved Fenders
    const rackTopY = wheelCenterY + wheelR + 0.11;
    const rackGeo = new THREE.BoxGeometry(0.36, 0.022, 0.15);
    const rackMesh = new THREE.Mesh(rackGeo, framePaintMat);
    rackMesh.position.set(rearX - 0.02, rackTopY, 0);
    rackMesh.castShadow = true;
    root.add(rackMesh);
    disposables.push(rackGeo);

    for (const zSide of [-0.065, 0.065]) {
      addTube(
        new THREE.Vector3(rearX, wheelCenterY, zSide),
        new THREE.Vector3(rearX - 0.12, rackTopY, zSide),
        0.010,
        0.010,
        framePaintMat,
      );
      addTube(
        new THREE.Vector3(seatTubeTop.x, seatTubeTop.y - 0.08, zSide * 0.8),
        new THREE.Vector3(rearX + 0.14, rackTopY, zSide),
        0.010,
        0.010,
        framePaintMat,
      );
    }

    // Crankset, Chainring & Pedals
    const chainringGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.014, 24);
    chainringGeo.rotateX(Math.PI / 2);
    const chainring = new THREE.Mesh(chainringGeo, alloyRimMat);
    chainring.position.set(bbPos.x, bbPos.y, 0.045);
    chainring.castShadow = true;
    root.add(chainring);
    disposables.push(chainringGeo);
  } else {
    // =========================================================================
    // CORTEZ E-SCOOTER 3D PBR ASSEMBLY (10X / NUX 48 / SHARK / M41)
    // =========================================================================
    const wheelR = 0.185;
    const tireTubeR = 0.058;
    const wheelCenterY = wheelR + tireTubeR * 0.85;
    const rearX = -0.48;
    const frontX = 0.48;

    const rearWheel = buildFatWheel(wheelR, tireTubeR);
    rearWheel.position.set(rearX, wheelCenterY, 0);
    root.add(rearWheel);
    wheels.push(rearWheel);

    const frontWheel = buildFatWheel(wheelR, tireTubeR);
    frontWheel.position.set(frontX, wheelCenterY, 0);
    root.add(frontWheel);
    wheels.push(frontWheel);

    // Wide Deck with CORTEZ Red Side Trim
    const deckGeo = new THREE.BoxGeometry(0.76, 0.065, 0.24);
    const deckMesh = new THREE.Mesh(deckGeo, framePaintMat);
    deckMesh.position.set(-0.02, wheelCenterY + 0.02, 0);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    root.add(deckMesh);

    const trimGeo = new THREE.BoxGeometry(0.77, 0.024, 0.246);
    const trimMesh = new THREE.Mesh(trimGeo, accentRedMat);
    trimMesh.position.set(-0.02, wheelCenterY + 0.02, 0);
    root.add(trimMesh);
    disposables.push(deckGeo, trimGeo);

    // Front & Rear C-Suspension Swingarms + Red Coil Shocks
    for (const zSide of [-0.065, 0.065]) {
      addTube(
        new THREE.Vector3(-0.34, wheelCenterY + 0.03, zSide),
        new THREE.Vector3(rearX, wheelCenterY, zSide),
        0.018,
        0.015,
        framePaintMat,
      );
      addTube(
        new THREE.Vector3(0.32, wheelCenterY + 0.06, zSide),
        new THREE.Vector3(frontX, wheelCenterY, zSide),
        0.018,
        0.015,
        framePaintMat,
      );
    }
    addTube(
      new THREE.Vector3(0.32, wheelCenterY + 0.14, 0),
      new THREE.Vector3(frontX - 0.04, wheelCenterY + 0.02, 0),
      0.024,
      0.024,
      accentRedMat,
    );

    // Neck & Steering Column
    const neckBase = new THREE.Vector3(0.30, wheelCenterY + 0.04, 0);
    const neckTop = new THREE.Vector3(0.41, wheelCenterY + 0.28, 0);
    const barTop = new THREE.Vector3(0.28, wheelCenterY + 1.02, 0);
    addTube(neckBase, neckTop, 0.038, 0.034, framePaintMat);
    addTube(neckTop, barTop, 0.024, 0.021, framePaintMat);
    addTube(
      new THREE.Vector3(barTop.x, barTop.y, -0.26),
      new THREE.Vector3(barTop.x, barTop.y, 0.26),
      0.016,
      0.016,
      framePaintMat,
    );
  }

  return {
    root,
    wheels,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
