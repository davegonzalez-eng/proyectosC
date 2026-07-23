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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// Lamp mode: a warm point light + glowing "bulb" core at the sphere's
// center, and the perforation pattern's alpha-tested holes let it shine
// through - the same idea as the current main sculpture's lamp mode, and
// the reference photo of an actual lit 3D-printed piece like this one.
const lampLight = new THREE.PointLight(0xffb066, 0, 4.5);
lampLight.position.set(0, 0, 0);
scene.add(lampLight);
const lampCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 24, 24),
  new THREE.MeshStandardMaterial({ color: 0xfff3d8, emissive: 0xffc07a, emissiveIntensity: 2.5, roughness: 1 })
);
lampCore.visible = false;
scene.add(lampCore);

function applyLampMode(on) {
  lampLight.intensity = on ? params.lampIntensity : 0;
  lampCore.visible = on;
  // Dim the external "room" light so the internal glow reads clearly
  // through the perforations instead of being washed out.
  keyLight.intensity = on ? 0.5 : 1.6;
  ambientLight.intensity = on ? 0.08 : 0.3;
  scene.background.setHex(on ? 0x05060a : 0x14161c);
}

// Cross-section "pane": a single clipping plane, sliceable along any axis,
// so the internal structure (and the lamp core) can be inspected without
// the outer shell in the way. Shared across the sculpture's two materials;
// three.js discards fragments on the plane's negative side.
renderer.localClippingEnabled = true;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clipHelper = new THREE.PlaneHelper(clipPlane, 6, 0x7fd1ff);
clipHelper.visible = false;
scene.add(clipHelper);

function applyClipping() {
  const axisVec = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  }[params.clipAxis];
  clipPlane.normal.copy(axisVec).multiplyScalar(params.clipFlip ? -1 : 1);
  clipPlane.constant = -params.clipOffset * (params.clipFlip ? -1 : 1);
  const planes = params.clipEnabled ? [clipPlane] : null;
  for (const mat of [sculptureMaterial, rimMaterial]) {
    mat.clippingPlanes = planes;
    mat.needsUpdate = true;
  }
  clipHelper.visible = params.clipEnabled;
}

// Material presets - the full set from the earlier Quin raymarched study,
// translated to metalness/roughness for MeshStandardMaterial.
const MATERIAL_PRESETS = {
  golden: { color: 0xffa640, metalness: 0.9, roughness: 0.28, envMapIntensity: 1 },
  silver: { color: 0xd9dee8, metalness: 0.95, roughness: 0.15, envMapIntensity: 1 },
  copper: { color: 0xf27a4d, metalness: 0.85, roughness: 0.3, envMapIntensity: 1 },
  bronze: { color: 0xd7b978, metalness: 0.75, roughness: 0.32, envMapIntensity: 1 },
  brass: { color: 0xe6d24d, metalness: 0.85, roughness: 0.25, envMapIntensity: 1 },
  steel: { color: 0x999da6, metalness: 0.85, roughness: 0.35, envMapIntensity: 1 },
  chrome: { color: 0xe8e9eb, metalness: 1.0, roughness: 0.08, envMapIntensity: 1 },
  aluminum: { color: 0xbfbfbf, metalness: 0.7, roughness: 0.4, envMapIntensity: 1 },
  titanium: { color: 0x9aa0a6, metalness: 0.9, roughness: 0.45, envMapIntensity: 1 },
  gunmetal: { color: 0x59616e, metalness: 0.9, roughness: 0.4, envMapIntensity: 1 },
  matteWhite: { color: 0xf4f1ea, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.25 },
  matteClay: { color: 0xd1bf9e, metalness: 0.0, roughness: 0.98, envMapIntensity: 0.15 },
};

// One shared material for stars AND extensions so the perforation pattern
// reads as a single continuous surface across the joins. The rim gets its
// OWN material with the same color/finish but never perforated - a thin
// rim strip run through the same hex/coral alpha cutout reads as a broken
// chain of little tiles rather than the reference's clean solid border,
// since the holes are wide relative to the rim's own width.
const sculptureMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
const rimMaterial = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });

function applyMaterialPreset(name) {
  const p = MATERIAL_PRESETS[name] || MATERIAL_PRESETS.golden;
  for (const mat of [sculptureMaterial, rimMaterial]) {
    mat.color.setHex(p.color);
    mat.metalness = p.metalness;
    mat.roughness = p.roughness;
    mat.envMapIntensity = p.envMapIntensity;
    mat.needsUpdate = true;
  }
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
  starRotationDeg: 29,
  tipScale: 1.28,
  turns: 0.1,
  hubRadiusFrac: 0.24,
  bandHalfWidth: 0.23,
  tipWidthFrac: 0.12,
  widthTaperPower: 0.9,
  thickness: 0.015,
  tipThicknessFrac: 0.17,
  bulgeStrength: 0.16,
  tipDipStrength: 0.29,
  surfTwistDeg: -3,
  filletFrac: 0.1,
  subdivisions: 3,
  // Exponential tip bend: an extra dip + twist concentrated in just the
  // last stretch before an arm's tip, so its plane already roughly
  // matches the extension's incoming plane instead of meeting it near
  // perpendicular.
  tipBendStrength: 0.12,
  tipBendTwistDeg: 37,
  tipBendPower: 5,
  // Connections: arm extensions, a calligraphic hairpin (loop near the
  // tip, then a bridge to the target tip) rather than a single smooth arc.
  showExtensions: false,
  extTwistDeg: 0,
  extLengthFactor: 0.15,
  extDepthFraction: 0.95,
  extLoopRadiusFactor: 1,
  extLoopSweepDeg: 180,
  extLoopTFraction: 0.1,
  // Rim bead tracing every boundary edge (outer silhouette + gaps),
  // like the earlier Quin study's RIM_W/RIM_PROUD.
  showRim: true,
  rimWidthFrac: 0.02,
  rimProudFrac: 0.02,
  // Appearance.
  material: 'golden',
  pattern: 'hex',
  holeSize: 0.24,
  patternScale: 3.2,
  lampMode: true,
  lampIntensity: 19,
  showLabels: false,
  // Debug: click a face to hide it (its star sheet + rim).
  debugFacePick: true,
  // Cross-section clipping plane.
  clipEnabled: false,
  clipAxis: 'z',
  clipOffset: -0.22,
  clipFlip: false,
};

let starGroup = null;
let extGroup = null;
let rimGroup = null;
let labelGroup = null;

// Debug face click-to-hide: which face indices are currently hidden,
// surviving across rebuild() (which throws away and remakes every mesh on
// almost every parameter change) by being re-applied at the end of it.
const hiddenFaceIndices = new Set();
function applyHiddenFaces() {
  starGroup.children.forEach((m) => { m.visible = !hiddenFaceIndices.has(m.userData.faceIndex); });
  rimGroup.children.forEach((m) => { m.visible = !hiddenFaceIndices.has(m.userData.faceIndex); });
}

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
    const starMesh = new THREE.Mesh(geometry, sculptureMaterial);
    starMesh.userData.faceIndex = face.index;
    starGroup.add(starMesh);

    if (params.showRim) {
      const rimGeom = buildStarRim(star2D, face, params);
      const rimMesh = new THREE.Mesh(rimGeom, rimMaterial);
      rimMesh.userData.faceIndex = face.index;
      rimGroup.add(rimMesh);
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
        loopRadiusFactor: params.extLoopRadiusFactor,
        loopSweepDeg: params.extLoopSweepDeg,
        loopTFraction: params.extLoopTFraction,
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
  applyHiddenFaces();

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
bindSlider('tipBendStrength', 'tipBendStrength');
bindSlider('tipBendTwistDeg', 'tipBendTwistDeg');
bindSlider('tipBendPower', 'tipBendPower');
bindSlider('extTwistDeg', 'extTwistDeg');
bindSlider('extLengthFactor', 'extLengthFactor');
bindSlider('extDepthFraction', 'extDepthFraction');
bindSlider('extLoopRadiusFactor', 'extLoopRadiusFactor');
bindSlider('extLoopSweepDeg', 'extLoopSweepDeg');
bindSlider('extLoopTFraction', 'extLoopTFraction');
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
document.getElementById('lampMode').addEventListener('change', (e) => {
  params.lampMode = e.target.checked;
  applyLampMode(params.lampMode);
});
document.getElementById('lampIntensity').addEventListener('input', (e) => {
  params.lampIntensity = parseFloat(e.target.value);
  document.getElementById('v-lampIntensity').textContent = params.lampIntensity;
  if (params.lampMode) lampLight.intensity = params.lampIntensity;
});
document.getElementById('debugFacePick').addEventListener('change', (e) => {
  params.debugFacePick = e.target.checked;
});
document.getElementById('clipEnabled').addEventListener('change', (e) => {
  params.clipEnabled = e.target.checked;
  applyClipping();
});
document.getElementById('clipAxis').addEventListener('change', (e) => {
  params.clipAxis = e.target.value;
  applyClipping();
});
document.getElementById('clipFlip').addEventListener('change', (e) => {
  params.clipFlip = e.target.checked;
  applyClipping();
});
document.getElementById('clipOffset').addEventListener('input', (e) => {
  params.clipOffset = parseFloat(e.target.value);
  document.getElementById('v-clipOffset').textContent = params.clipOffset;
  applyClipping();
});

// Click-to-hide faces (debug): raycast against the star sheets, toggling
// visibility of that face's star + rim mesh. Distinguishes a click from an
// orbit-drag by pointer travel distance, since OrbitControls also listens
// on the same canvas and a drag-to-rotate shouldn't also toggle a face.
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDownAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const start = pointerDownAt;
  pointerDownAt = null;
  if (!params.debugFacePick || !start) return;
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return; // drag/orbit, not a click
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(starGroup.children, false);
  if (!hits.length) return;
  const faceIndex = hits[0].object.userData.faceIndex;
  if (faceIndex === undefined) return;
  if (hiddenFaceIndices.has(faceIndex)) hiddenFaceIndices.delete(faceIndex);
  else hiddenFaceIndices.add(faceIndex);
  applyHiddenFaces();
});

// Settings-table export: a copy-pasteable markdown table of every current
// parameter, so the user can hand tuned values straight back without
// re-typing a screenshot's numbers by hand.
document.getElementById('exportSettings').addEventListener('click', async () => {
  const rows = Object.entries(params)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join('\n');
  const table = `| Param | Value |\n| --- | --- |\n${rows}`;
  const out = document.getElementById('settingsOutput');
  out.value = table;
  out.style.display = 'block';
  out.focus();
  out.select();
  const status = document.getElementById('exportStatus');
  try {
    await navigator.clipboard.writeText(table);
    status.textContent = 'Copied to clipboard!';
  } catch {
    status.textContent = 'Clipboard blocked - text is selected below, copy manually.';
  }
  setTimeout(() => { status.textContent = ''; }, 4000);
});

// Push every param's actual value into its DOM control (slider position/
// label, checkbox checked state, select value) - the HTML's own hardcoded
// `value`/`checked`/`selected` attributes are just a static starting point
// for markup readability and easily drift out of sync with the real JS
// defaults above (as happened here: the panel kept showing "Bronze" and
// an unchecked lamp-mode box while matteClay + lamp mode were actually
// being rendered). Called once for everything at load, and reused by
// setParams() for whichever keys it's given.
function syncControl(key) {
  const el = document.getElementById(key);
  const label = document.getElementById(`v-${key}`);
  if (el && el.type === 'range') el.value = params[key];
  if (el && el.type === 'checkbox') el.checked = params[key];
  if (el && el.tagName === 'SELECT') el.value = params[key];
  if (label) label.textContent = params[key];
}
for (const key of Object.keys(params)) syncControl(key);

applyMaterialPreset(params.material);
applyPattern();
applyLampMode(params.lampMode);
applyClipping();
rebuild();

window.__spiralDodeca = {
  params,
  setStarsVisible(v) { starGroup.visible = v; },
  setExtensionsVisible(v) { extGroup.visible = v; },
  setParams(partial) {
    Object.assign(params, partial);
    for (const key of Object.keys(partial)) syncControl(key);
    applyMaterialPreset(params.material);
    applyPattern();
    applyLampMode(params.lampMode);
    applyClipping();
    if (params.showLabels !== undefined) setLabelsVisible(params.showLabels);
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
