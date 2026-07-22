// Isolated viewer for the Option B single-face spiral band prototype
// (see spiralarm.js). Renders exactly one dodecahedron face - its outline
// wireframe for reference, plus the new wide spiral band - with nothing
// else from the rest of the app, so the new motif can be judged on its own
// before any wiring into the full 12-face/60-connection sculpture.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildDodecahedron } from './geometry.js';
import { buildSpiralBand } from './spiralarm.js';

const container = document.getElementById('scene-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161c);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(1.6, 1.2, 2.0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const material = new THREE.MeshStandardMaterial({
  color: 0xf3f1ea,
  roughness: 0.55,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

const faces = buildDodecahedron(1);
const face = faces[0];

// Look straight down the face normal by default - the most useful angle for
// judging the band's shape/coverage against the pentagon it fills.
camera.position.copy(face.center).addScaledVector(face.normal, 1.9);
camera.up.copy(face.W);
controls.target.copy(face.center);
camera.lookAt(face.center);
controls.update();

// Reference: the face's own flat pentagon outline, so the band's scale is
// easy to judge against the surface it's meant to occupy.
const outlinePts = [...face.vertices3D, face.vertices3D[0]];
const outlineGeom = new THREE.BufferGeometry().setFromPoints(outlinePts);
const outlineLine = new THREE.Line(outlineGeom, new THREE.LineBasicMaterial({ color: 0x4a90d9 }));
scene.add(outlineLine);

let bandMesh = null;

const params = {
  turns: 1.4,
  holeLoopTurns: 0.85,
  rHoleFrac: 0.16,
  bandHalfWidth: 0.22,
  endHalfWidthFrac: 0.32,
  thickness: 0.05,
  bulgeStrength: 0.2,
  tipDipStrength: 0.36,
  surfTwistDeg: 30,
};

function rebuild() {
  if (bandMesh) {
    scene.remove(bandMesh);
    bandMesh.geometry.dispose();
  }
  const { geometry, metrics } = buildSpiralBand(face, params);
  bandMesh = new THREE.Mesh(geometry, material);
  scene.add(bandMesh);

  document.getElementById('metrics').innerHTML =
    `Band width / face radius: ${metrics.bandWidthOverFaceRadius.toFixed(3)}<br>` +
    `Total turning angle: ${metrics.totalTurningDeg.toFixed(0)}&deg;<br>` +
    `Hole radius / band width: ${metrics.holeRadiusOverBandWidth.toFixed(2)}`;
}

function bindSlider(id, key) {
  const el = document.getElementById(id);
  const label = document.getElementById(`v-${key}`);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    params[key] = v;
    label.textContent = v;
    rebuild();
  });
}

bindSlider('turns', 'turns');
bindSlider('holeLoopTurns', 'holeLoopTurns');
bindSlider('rHoleFrac', 'rHoleFrac');
bindSlider('bandHalfWidth', 'bandHalfWidth');
bindSlider('endHalfWidthFrac', 'endHalfWidthFrac');
bindSlider('thickness', 'thickness');
bindSlider('bulgeStrength', 'bulgeStrength');
bindSlider('tipDipStrength', 'tipDipStrength');
bindSlider('surfTwistDeg', 'surfTwistDeg');

rebuild();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
