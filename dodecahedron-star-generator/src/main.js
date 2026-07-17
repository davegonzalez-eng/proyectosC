import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/CSS2DRenderer.js';
import { buildDodecahedron, buildStar } from './geometry.js';
import { buildRibbon } from './ribbon.js';

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

const params = {
  swirlDeg: 30,
  k: 4,
  waveEnabled: true,
  innerRatio: 0.382,
  tipScale: 0.96,
  bulgeStrength: 0,
  tubeRadius: 0.025,
  twistTurns: 1,
  ribbonHalfWidth: 0.09,
  showFaceLabels: true,
  showArmLabels: true,
};

const RADIUS = 2;
const faces = buildDodecahedron(RADIUS);

/** @type {Map<string, {position: THREE.Vector3, outDir: THREE.Vector3, label: string}>} */
let tipsByLabel = new Map();
let connections = []; // [{a: 'F0-A2', b: 'F5-A1'}]
let pendingPick = null;

// ---------------------------------------------------------------------
// Renderer / scene setup
// ---------------------------------------------------------------------

const container = document.getElementById('scene-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 3.2, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2.5;
controls.maxDistance = 20;

scene.add(new THREE.HemisphereLight(0xffffff, 0x33303a, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(5, 8, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
fill.position.set(-6, -3, -4);
scene.add(fill);

const starMaterial = new THREE.MeshStandardMaterial({
  color: 0xd7b978,
  metalness: 0.75,
  roughness: 0.32,
});
const ribbonMaterial = new THREE.MeshStandardMaterial({
  color: 0x9fd0e0,
  metalness: 0.55,
  roughness: 0.28,
  side: THREE.DoubleSide,
});
const markerMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.2, roughness: 0.6 });
const markerPickedMaterial = new THREE.MeshStandardMaterial({ color: 0xff5050, metalness: 0.2, roughness: 0.4 });

const starsGroup = new THREE.Group();
const labelsGroup = new THREE.Group();
const markersGroup = new THREE.Group();
const ribbonsGroup = new THREE.Group();
scene.add(starsGroup, labelsGroup, markersGroup, ribbonsGroup);

// ---------------------------------------------------------------------
// Star (re)construction
// ---------------------------------------------------------------------

function makeLabelDiv(text, className) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

function rebuildStars() {
  starsGroup.clear();
  labelsGroup.clear();
  markersGroup.clear();
  tipsByLabel = new Map();

  for (const face of faces) {
    const star = buildStar(face, params);

    const curve = new THREE.CatmullRomCurve3(star.outline, true, 'catmullrom', 0.5);
    const tubeGeom = new THREE.TubeGeometry(curve, 200, params.tubeRadius, 8, true);
    starsGroup.add(new THREE.Mesh(tubeGeom, starMaterial));

    if (params.showFaceLabels) {
      const faceLabel = new CSS2DObject(makeLabelDiv(face.label, 'face-label'));
      faceLabel.position.copy(face.center.clone().addScaledVector(face.normal, 0.06));
      labelsGroup.add(faceLabel);
    }

    for (const tip of star.tips) {
      tipsByLabel.set(tip.label, tip);

      const marker = new THREE.Mesh(new THREE.SphereGeometry(params.tubeRadius * 1.9, 12, 12), markerMaterial);
      marker.position.copy(tip.position);
      marker.userData.label = tip.label;
      markersGroup.add(marker);

      if (params.showArmLabels) {
        const armLabel = new CSS2DObject(makeLabelDiv(tip.label, 'arm-label'));
        armLabel.position.copy(tip.position.clone().addScaledVector(tip.outDir, 0.12));
        labelsGroup.add(armLabel);
      }
    }
  }

  refreshMarkerHighlight();
}

function refreshMarkerHighlight() {
  for (const marker of markersGroup.children) {
    marker.material = marker.userData.label === pendingPick ? markerPickedMaterial : markerMaterial;
  }
}

// ---------------------------------------------------------------------
// Ribbon (re)construction
// ---------------------------------------------------------------------

function rebuildRibbons() {
  ribbonsGroup.clear();
  for (const { a, b } of connections) {
    const tipA = tipsByLabel.get(a);
    const tipB = tipsByLabel.get(b);
    if (!tipA || !tipB) continue;
    const { geometry } = buildRibbon(tipA, tipB, {
      halfWidth: params.ribbonHalfWidth,
      twistTurns: params.twistTurns,
    });
    ribbonsGroup.add(new THREE.Mesh(geometry, ribbonMaterial));
  }
}

/** Parse free-form connection text into ordered pairs of F#-A# labels. */
function parseConnections(text) {
  const tokens = (text.match(/F\s*\d+\s*-\s*A\s*\d+/gi) || []).map((t) =>
    t.toUpperCase().replace(/\s+/g, '')
  );
  const pairs = [];
  const invalidTokens = [];
  const validTokens = tokens.filter((t) => {
    const m = t.match(/^F(\d+)-A(\d+)$/);
    const ok = m && Number(m[1]) < faces.length && Number(m[2]) < 5;
    if (!ok) invalidTokens.push(t);
    return ok;
  });
  for (let i = 0; i + 1 < validTokens.length; i += 2) {
    pairs.push({ a: validTokens[i], b: validTokens[i + 1] });
  }
  const leftover = validTokens.length % 2 === 1 ? validTokens[validTokens.length - 1] : null;
  return { pairs, invalidTokens, leftover };
}

// ---------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------

function bindSlider(id, key, { toParam = (v) => v, format = (v) => v } = {}) {
  const input = document.getElementById(id);
  const readout = document.getElementById(id + '-value');
  const apply = () => {
    params[key] = toParam(Number(input.value));
    if (readout) readout.textContent = format(params[key]);
    rebuildStars();
    rebuildRibbons();
  };
  input.addEventListener('input', apply);
  apply();
}

bindSlider('swirl', 'swirlDeg', { format: (v) => `${v.toFixed(0)}°` });
bindSlider('k', 'k', { format: (v) => v.toFixed(1) });
bindSlider('bulge', 'bulgeStrength', { format: (v) => v.toFixed(2) });
bindSlider('tubeRadius', 'tubeRadius', { format: (v) => v.toFixed(3) });
bindSlider('twist', 'twistTurns', { format: (v) => v.toFixed(1) });

document.getElementById('wave-enabled').addEventListener('change', (e) => {
  params.waveEnabled = e.target.checked;
  rebuildStars();
  rebuildRibbons();
});
document.getElementById('face-labels').addEventListener('change', (e) => {
  params.showFaceLabels = e.target.checked;
  rebuildStars();
});
document.getElementById('arm-labels').addEventListener('change', (e) => {
  params.showArmLabels = e.target.checked;
  rebuildStars();
});

const connectionsInput = document.getElementById('connections-input');
const statusEl = document.getElementById('connections-status');

function applyConnectionsFromInput() {
  const { pairs, invalidTokens, leftover } = parseConnections(connectionsInput.value);
  connections = pairs;
  rebuildRibbons();
  const bits = [`${pairs.length} ribbon${pairs.length === 1 ? '' : 's'} drawn`];
  if (invalidTokens.length) bits.push(`ignored invalid: ${invalidTokens.join(', ')}`);
  if (leftover) bits.push(`unmatched trailing arm: ${leftover}`);
  statusEl.textContent = bits.join(' — ');
}

document.getElementById('connect-btn').addEventListener('click', applyConnectionsFromInput);
document.getElementById('clear-btn').addEventListener('click', () => {
  connectionsInput.value = '';
  connections = [];
  rebuildRibbons();
  statusEl.textContent = 'cleared';
});

// Click two arm markers in the 3D view to append a connection pair.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markersGroup.children, false);
  if (!hits.length) return;

  const label = hits[0].object.userData.label;
  if (!pendingPick) {
    pendingPick = label;
    statusEl.textContent = `picked ${label} — click another arm to connect it`;
  } else if (pendingPick === label) {
    pendingPick = null;
    statusEl.textContent = 'selection cleared';
  } else {
    const existing = connectionsInput.value.trim();
    connectionsInput.value = existing ? `${existing}, ${pendingPick}:${label}` : `${pendingPick}:${label}`;
    pendingPick = null;
    applyConnectionsFromInput();
  }
  refreshMarkerHighlight();
});

// ---------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

rebuildStars();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
