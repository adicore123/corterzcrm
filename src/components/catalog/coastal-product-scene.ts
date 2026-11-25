import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { oceanVertexShader } from "@/shaders/ocean.vert.glsl";
import { oceanFragmentShader } from "@/shaders/ocean.frag.glsl";
import { sandVertexShader, sandFragmentShader } from "@/shaders/sand.glsl";

/**
 * Photorealistic Mediterranean Coastal Environment for 360-degree glTF/GLB product inspection.
 * Combines Preetham Atmospheric Sky, 8-wave Gerstner Ocean, and Wet/Dry PBR Sand Terrain.
 */
export function addCoastalProductScene(scene: THREE.Scene, radius: number, reducedMotion: boolean) {
  const s = Math.max(radius, 0.5);
  scene.background = new THREE.Color("#d9e8ef");

  const sky = new Sky();
  sky.scale.setScalar(s * 240);
  const elevationDeg = 14.0;
  const azimuthDeg = -26.0;
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(180 + azimuthDeg);
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();

  sky.material.uniforms["turbidity"].value = 3.2;
  sky.material.uniforms["rayleigh"].value = 1.75;
  sky.material.uniforms["mieCoefficient"].value = 0.0042;
  sky.material.uniforms["mieDirectionalG"].value = 0.84;
  sky.material.uniforms["sunPosition"].value.copy(sunDirection);
  scene.add(sky);

  const oceanUniforms = {
    uTime: { value: 18.4 },
    uQuality: { value: 1.0 },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, s * 1.4, s * 3.5) },
  };
  const oceanGeo = new THREE.PlaneGeometry(s * 140, s * 90, 96, 84);
  oceanGeo.rotateX(-Math.PI / 2);
  oceanGeo.translate(0, -s * 0.52, -s * 42);
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    transparent: true,
    depthWrite: true,
    toneMapped: true,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.renderOrder = 2;
  scene.add(oceanMesh);

  const sandUniforms = {
    uTime: { value: 18.4 },
    uQuality: { value: 1.0 },
    uSunDir: { value: sunDirection.clone() },
    uCameraPos: { value: new THREE.Vector3(0, s * 1.4, s * 3.5) },
    uProductXZ: { value: new THREE.Vector2(0, 0) },
    uProductSpan: { value: s * 1.65 },
  };
  const sandGeo = new THREE.PlaneGeometry(s * 120, s * 34, 72, 56);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(0, -s * 0.54, -s * 5);
  const sandMat = new THREE.ShaderMaterial({
    uniforms: sandUniforms,
    vertexShader: sandVertexShader,
    fragmentShader: sandFragmentShader,
    toneMapped: true,
  });
  const sandMesh = new THREE.Mesh(sandGeo, sandMat);
  sandMesh.receiveShadow = true;
  sandMesh.renderOrder = 1;
  scene.add(sandMesh);

  return {
    tick(now: number) {
      if (!reducedMotion) {
        const t = 18.4 + now * 0.001;
        oceanUniforms.uTime.value = t;
        sandUniforms.uTime.value = t;
      }
    },
    dispose() {
      scene.remove(sky, oceanMesh, sandMesh);
      sky.geometry.dispose();
      sky.material.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      sandGeo.dispose();
      sandMat.dispose();
    },
  };
}
