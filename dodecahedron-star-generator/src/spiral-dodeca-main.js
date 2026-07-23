// Option B prototype: the full 12-face dodecahedron wearing the 5-arm
// spiral-star motif - each star now built as ONE solid, smoothly-fused
// sheet (buildSolidStar2D + mapSolidStarToFace in spiralarm.js) instead of
// 5 overlapping slabs, with material presets and hex/coral perforation
// patterns, and connected by ARM EXTENSIONS (buildArmExtension): each arm
// continues past its tip, twisting counter-clockwise, to meet the arm of
// the star it connects to - no separate ribbon shapes.
//
// The connection pairs come from computeAdjacentFaceConnections() in
// geometry.js, unchanged - the rule reverse-engineered from the user's
// reference sequences for face 7 and face 1 in the original project
// (F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1 ...).
// The "Show labels" toggle displays each face/arm's F#-A# label so the
// mapping can be audited and amended; the panel also lists all 60 pairs.
//
// A separate, standalone page (not wired into index.html/main.js) so the
// current 60-thin-arm sculpture keeps working untouched while this is
// judged on its own - see spiral-dodeca-prototype.html.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/CSS2DRenderer.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildDodecahedron, computeAdjacentFaceConnections } from './geometry.js';
import { buildSolidStar2D, mapSolidStarToFace, buildArmExtension, buildStarRim } from './spiralarm.js';
import { createPerforationTexture } from './hextexture.js';

const container = document.getElementById('scene-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161c);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 3.2, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(5, 6, 7);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// Material presets - same family as the main sculpture's, plus the warm
// "golden" default the earlier hex-web study used.
const MATERIAL_PRESETS = {
  golden: { color: 0xffa640, metalness: 0.9, roughness: 0.28, envMapIntensity: 1 },
  matteWhite: { color: 0xf4f1ea, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.25 },
  bronze: { color: 0xd7b978, metalness: 0.75, roughness: 0.32, envMapIntensity: 1 },
  copper: { color: 0xf27a4d, metalness: 0.85, roughness: 0.3, envMapIntensity: 1 },
  titanium: { color: 0x9aa0a6, metalness: 0.9, roughness: 0.45, envMapIntensity: 1 },
  chrome: { color: 0xe8e9eb, metalness: 1.0, roughness: 0.08, envMapIntensity: 1 },
  gunmetal: { color: 0x59616e, metalness: 0.9, roughness: 0.4, envMapIntensity: 1 },
};

// One shared material for stars AND extensions so the perforation pattern
// reads as a single continuous surface across the joins.
const sculptureMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });

function applyMaterialPreset(name) {
  const p = MATERIAL_PRESETS[name] || MATERIAL_PRESETS.golden;
  sculptureMaterial.color.setHex(p.color);
  sculptureMaterial.metalness = p.metalness;
  sculptureMaterial.roughness = p.roughness;
  sculptureMaterial.envMapIntensity = p.envMapIntensity;
  sculptureMaterial.needsUpdate = true;
}

function applyPattern() {
  if (sculptureMaterial.alphaMap) sculptureMaterial.alphaMap.dispose();
  if (sculptureMaterial.bumpMap) sculptureMaterial.bumpMap.dispose();
  if (params.pattern === 'none' || params.holeSize <= 0.005) {
    sculptureMaterial.alphaMap = null;
    sculptureMaterial.bumpMap = null;
    sculptureMaterial.alphaTest = 0;
  } else {
    const tex = createPerforationTexture({
      cellPx: 28,
      holeFrac: params.holeSize,
      jitter: params.pattern === 'coral' ? 0.45 : 0,
    });
    // UVs are (u, w) in world units; repeat = pattern tiles per world unit.
    tex.repeat.set(params.patternScale, params.patternScale);
    sculptureMaterial.alphaMap = tex;
    sculptureMaterial.bumpMap = tex;
    sculptureMaterial.bumpScale = 0.02;
    sculptureMaterial.alphaTest = 0.45;
  }
  sculptureMaterial.needsUpdate = true;
}

const RADIUS = 2;
const faces = buildDodecahedron(RADIUS);
// The same rule + 60 pairs the original 5-thin-arm sculpture uses, derived
// from the user's reference connection sequences (see geometry.js).
const connections = computeAdjacentFaceConnections(faces);

const params = {
  // Star shape - user's preferred settings from the live panel.
  starRotationDeg: 24,
  tipScale: 1.28,
  turns: 0.1,
  hubRadiusFrac: 0.02,
  bandHalfWidth: 0.24,
  tipWidthFrac: 0.44,
  widthTaperPower: 0.8,
  thickness: 0.015,
  tipThicknessFrac: 0.17,
  bulgeStrength: 0.23,
  tipDipStrength: 0.32,
  surfTwistDeg: -45,
  filletFrac: 0.06,
  subdivisions: 3,
  // Connections: arm extensions.
  showExtensions: true,
  extTwistDeg: -210,
  extLengthFactor: 0.38,
  extDepthFraction: 0.85,
  // Rim bead tracing every boundary edge (outer silhouette + gaps),
  // like the earlier Quin study's RIM_W/RIM_PROUD.
  showRim: true,
  rimWidthFrac: 0.02,
  rimProudFrac: 0.025,
  // Appearance.
  material: 'golden',
  pattern: 'hex',
  holeSize: 0.21,
  patternScale: 3.2,
  showLabels: false,
};

let starGroup = null;
let extGroup = null;
let rimGroup = null;
let labelGroup = null;

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
}

function makeLabel(text, cls) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  return new CSS2DObject(div);
}

function setLabelsVisible(v) {
  if (!labelGroup) return;
  labelGroup.traverse((obj) => {
    obj.visible = v;
    if (obj.element) obj.element.style.display = v ? '' : 'none';
  });
  labelGroup.visible = true; // group itself stays on; children carry the toggle
}

function rebuild() {
  for (const g of [starGroup, extGroup, rimGroup, labelGroup]) {
    if (g) {
      scene.remove(g);
      disposeGroup(g);
    }
  }
  starGroup = new THREE.Group();
  extGroup = new THREE.Group();
  rimGroup = new THREE.Group();
  labelGroup = new THREE.Group();

  // The 2D star (field union of 5 arms + hub, marching squares,
  // triangulation, subdivision) is identical for every face - built once.
  const star2D = buildSolidStar2D(params, faces[0].R_out);

  /** @type {Map<string, {tipPosition: THREE.Vector3, tipTangent: THREE.Vector3}>} */
  const tipsByLabel = new Map();

  for (const face of faces) {
    const { geometry, arms } = mapSolidStarToFace(star2D, face, params);
    starGroup.add(new THREE.Mesh(geometry, sculptureMaterial));

    if (params.showRim) {
      const rimGeom = buildStarRim(star2D, face, params);
      rimGroup.add(new THREE.Mesh(rimGeom, sculptureMaterial));
    }

    const faceLabel = makeLabel(`F${face.index}`, 'face-label');
    faceLabel.position.copy(face.center.clone().multiplyScalar(1.12));
    labelGroup.add(faceLabel);

    for (const arm of arms) {
      const label = `F${face.index}-A${arm.armIndex}`;
      tipsByLabel.set(label, arm);
      const armLabel = makeLabel(`A${arm.armIndex}`, 'arm-label');
      armLabel.position.copy(arm.tipPosition.clone().multiplyScalar(1.03));
      labelGroup.add(armLabel);
    }
  }

  const R = faces[0].R_out;
  const tipHalfWidth = R * params.bandHalfWidth * params.tipWidthFrac;
  const tipHalfThickness = (R * params.thickness * params.tipThicknessFrac) / 2;

  let missing = 0;
  if (params.showExtensions) {
    for (const { a, b } of connections) {
      const tipA = tipsByLabel.get(a);
      const tipB = tipsByLabel.get(b);
      if (!tipA || !tipB) {
        missing++;
        continue;
      }
      const { geometry } = buildArmExtension(tipA, tipB, {
        halfWidth: tipHalfWidth,
        halfThickness: tipHalfThickness,
        lengthFactor: params.extLengthFactor,
        twistDeg: params.extTwistDeg,
        depthFraction: params.extDepthFraction,
      });
      extGroup.add(new THREE.Mesh(geometry, sculptureMaterial));
    }
  }

  // The vendored CSS2DRenderer checks each object's own `visible`, not its
  // ancestors' - so toggle every label directly rather than the group.
  setLabelsVisible(params.showLabels);
  scene.add(starGroup);
  scene.add(extGroup);
  scene.add(rimGroup);
  scene.add(labelGroup);

  document.getElementById('metrics').innerHTML =
    `Faces: ${faces.length} | Tips: ${tipsByLabel.size}/60<br>` +
    `Extensions: ${params.showExtensions ? `${connections.length - missing}${missing ? ` (${missing} missing!)` : ''}` : 'off'}`;

  const listEl = document.getElementById('conn-list');
  if (listEl) {
    listEl.textContent = connections.map(({ a, b }) => `${a} -> ${b}`).join('\n');
  }
}

function bindSlider(id, key, opts = {}) {
  const el = document.getElementById(id);
  const label = document.getElementById(`v-${key}`);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    params[key] = v;
    if (label) label.textContent = v;
    if (opts.appearanceOnly) applyPattern();
    else rebuild();
  });
}

bindSlider('starRotationDeg', 'starRotationDeg');
bindSlider('tipScale', 'tipScale');
bindSlider('turns', 'turns');
bindSlider('hubRadiusFrac', 'hubRadiusFrac');
bindSlider('bandHalfWidth', 'bandHalfWidth');
bindSlider('tipWidthFrac', 'tipWidthFrac');
bindSlider('widthTaperPower', 'widthTaperPower');
bindSlider('thickness', 'thickness');
bindSlider('tipThicknessFrac', 'tipThicknessFrac');
bindSlider('bulgeStrength', 'bulgeStrength');
bindSlider('tipDipStrength', 'tipDipStrength');
bindSlider('surfTwistDeg', 'surfTwistDeg');
bindSlider('filletFrac', 'filletFrac');
bindSlider('subdivisions', 'subdivisions');
bindSlider('extTwistDeg', 'extTwistDeg');
bindSlider('extLengthFactor', 'extLengthFactor');
bindSlider('extDepthFraction', 'extDepthFraction');
bindSlider('rimWidthFrac', 'rimWidthFrac');
bindSlider('rimProudFrac', 'rimProudFrac');
bindSlider('holeSize', 'holeSize', { appearanceOnly: true });
bindSlider('patternScale', 'patternScale', { appearanceOnly: true });

document.getElementById('material').addEventListener('change', (e) => {
  params.material = e.target.value;
  applyMaterialPreset(params.material);
});
document.getElementById('pattern').addEventListener('change', (e) => {
  params.pattern = e.target.value;
  applyPattern();
});
document.getElementById('showExtensions').addEventListener('change', (e) => {
  params.showExtensions = e.target.checked;
  rebuild();
});
document.getElementById('showRim').addEventListener('change', (e) => {
  params.showRim = e.target.checked;
  rebuild();
});
document.getElementById('showLabels').addEventListener('change', (e) => {
  params.showLabels = e.target.checked;
  setLabelsVisible(params.showLabels);
});

applyMaterialPreset(params.material);
applyPattern();
rebuild();

window.__spiralDodeca = {
  params,
  setStarsVisible(v) { starGroup.visible = v; },
  setExtensionsVisible(v) { extGroup.visible = v; },
  setParams(partial) {
    Object.assign(params, partial);
    for (const key of Object.keys(partial)) {
      const el = document.getElementById(key);
      const label = document.getElementById(`v-${key}`);
      if (el && el.type === 'range') el.value = partial[key];
      if (el && el.tagName === 'SELECT') el.value = partial[key];
      if (label) label.textContent = partial[key];
    }
    applyMaterialPreset(params.material);
    applyPattern();
    rebuild();
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
