// Isolated viewer for the Option B single-face spiral band prototype
// (see spiralarm.js). Renders exactly one dodecahedron face - its outline
// wireframe for reference, plus the new wide spiral band - with nothing
// else from the rest of the app, so the new motif can be judged on its own
// before any wiring into the full 12-face/60-connection sculpture.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildDodecahedron } from './geometry.js';
import { buildSpiralStar } from './spiralarm.js';

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
  armCount: 5,
  turns: 0.35,
  holeLoopTurns: 0,
  rHoleFrac: 0.22,
  bandHalfWidth: 0.075,
  endHalfWidthFrac: 0.15,
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
  const { geometry, arms } = buildSpiralStar(face, params);
  bandMesh = new THREE.Mesh(geometry, material);
  scene.add(bandMesh);

  const m = arms[0].metrics;
  document.getElementById('metrics').innerHTML =
    `Arms: ${arms.length}<br>` +
    `Band width / face radius: ${m.bandWidthOverFaceRadius.toFixed(3)}<br>` +
    `Per-arm turning angle: ${m.totalTurningDeg.toFixed(0)}&deg;<br>` +
    `Hole radius / band width: ${m.holeRadiusOverBandWidth.toFixed(2)}`;
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

bindSlider('armCount', 'armCount');
bindSlider('turns', 'turns');
bindSlider('holeLoopTurns', 'holeLoopTurns');
bindSlider('rHoleFrac', 'rHoleFrac');
bindSlider('bandHalfWidth', 'bandHalfWidth');
bindSlider('endHalfWidthFrac', 'endHalfWidthFrac');
bindSlider('thickness', 'thickness');
bindSlider('bulgeStrength', 'bulgeStrength');
bindSlider('tipDipStrength', 'tipDipStrength');
bindSlider('surfTwistDeg', 'surfTwistDeg');

// Scriptable hook for automated proportion sweeps (Playwright, etc.): merges
// a partial params object, syncs the slider UI to match, and rebuilds - so
// external tooling can drive this page the same way a person dragging
// sliders would, without reimplementing the rebuild/label logic.
window.__spiralProto = {
  params,
  setParams(partial) {
    Object.assign(params, partial);
    for (const key of Object.keys(partial)) {
      const el = document.getElementById(key);
      const label = document.getElementById(`v-${key}`);
      if (el) el.value = partial[key];
      if (label) label.textContent = partial[key];
    }
    rebuild();
  },
  // Screen-space (pixel) coordinates of the face's own pentagon corners
  // under the current camera - lets external tooling (measurement scripts)
  // build a mask of "the face's own area" from a screenshot, independent of
  // whatever the band's own extent happens to be, to compute a real
  // Surface Coverage Ratio instead of eyeballing it.
  getPentagonScreenPoly() {
    const rect = renderer.domElement.getBoundingClientRect();
    return face.vertices3D.map((v) => {
      const p = v.clone().project(camera);
      return [((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height];
    });
  },
};

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
