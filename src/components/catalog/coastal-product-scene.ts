import * as THREE from "three";

/** A lightweight sea and sky for an actual glTF product mesh. */
export function addCoastalProductScene(scene: THREE.Scene, radius: number, reducedMotion: boolean) {
  scene.background = new THREE.Color("#dcecf1");
  scene.fog = new THREE.Fog("#dcecf1", radius * 18, radius * 56);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 58, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: "varying vec3 vPosition; void main(){ vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vPosition; void main(){ float h = smoothstep(-0.08, 0.58, normalize(vPosition).y); vec3 horizon = vec3(0.86, 0.94, 0.95); vec3 zenith = vec3(0.58, 0.79, 0.86); gl_FragColor = vec4(mix(horizon, zenith, h), 1.0); }",
    }),
  );
  scene.add(sky);

  const uniforms = { uTime: { value: 0 } };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 115, radius * 115, 64, 64),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader: `uniform float uTime; varying vec3 vWorld;
        void main() {
          vec3 p = position;
          p.z += (sin(p.x * 0.27 + uTime * 0.55) + sin(p.y * 0.22 - uTime * 0.42)) * 0.065;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `uniform float uTime; varying vec3 vWorld;
        void main() {
          float ripple = sin(vWorld.x * 0.48 + uTime * 0.7) * sin(vWorld.z * 0.34 - uTime * 0.46);
          float foam = smoothstep(0.68, 0.92, ripple) * 0.08;
          vec3 shallow = vec3(0.45, 0.72, 0.75);
          vec3 deep = vec3(0.28, 0.59, 0.68);
          vec3 color = mix(deep, shallow, clamp(ripple * 0.25 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(color + foam, 1.0);
        }`,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -radius * 0.86;
  sea.receiveShadow = false;
  scene.add(sea);

  return {
    tick(now: number) { if (!reducedMotion) uniforms.uTime.value = now / 1000; },
    dispose() {
      scene.remove(sky, sea);
      sky.geometry.dispose(); (sky.material as THREE.Material).dispose();
      sea.geometry.dispose(); (sea.material as THREE.Material).dispose();
      scene.fog = null;
    },
  };
}
