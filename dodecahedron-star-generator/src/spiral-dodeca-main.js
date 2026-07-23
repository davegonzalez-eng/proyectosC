// Option B prototype: the full 12-face dodecahedron, wearing the 5-arm
// spiral-star motif (spiralarm.js) on every face, with adjacent faces'
// arm tips connected by ribbons (ribbon.js) - the same fusion idea the
// current 5-thin-arm sculpture (main.js) uses, reusing its exact adjacency
// rule (computeAdjacentFaceConnections) unmodified.
//
// This works because arm `i`'s tip (angleOffset = i * 360/armCount, at
// theta=0) lands at EXACTLY the same direction from the face center as
// the old star's arm `i` tip (face.vertices3D[i]) - verified standalone
// under Node to 0.000 degrees of deviation. So the old adjacency rule's
// "F<face>-A<arm>" labels, computed purely from vertex topology, transfer
// directly: no new connection logic needed, just reusing the existing
// pairs against this motif's own tip positions/tangents.
//
// Unlike the old system, there's no tube to cut short and fuse a ribbon
// into - each arm already extends all the way to a real (if narrow) tip
// point. So ribbons here connect directly tip-to-tip with no entryA/entryB
// cut points, sized to match the arm's own tip half-width/thickness so the
// seam is width- and thickness-continuous.
//
// A separate, standalone page (not wired into index.html/main.js) so the
// current 60-thin-arm sculpture keeps working untouched while this is
// judged on its own - see spiral-dodeca-prototype.html.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildDodecahedron, computeAdjacentFaceConnections, applySurfaceTwist, applyTipDip } from './geometry.js';
import { buildSpiralStar } from './spiralarm.js';
import { buildRibbon } from './ribbon.js';

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

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(5, 6, 7);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const starMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3f1ea,
  roughness: 0.55,
  metalness: 0.05,
  side: THREE.DoubleSide,
});
const ribbonMaterial = new THREE.MeshStandardMaterial({
  color: 0xf3f1ea,
  roughness: 0.5,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

const RADIUS = 2;
const faces = buildDodecahedron(RADIUS);
// Purely topological (shared-vertex based), independent of arm shape/
// distortion - the same rule + the same 60 pairs the current 5-thin-arm
// sculpture uses, verified earlier to produce exact reference matches.
const connections = computeAdjacentFaceConnections(faces);

const params = {
  turns: 0.1,
  holeLoopTurns: 0,
  hubRadiusFrac: 0.02,
  bandHalfWidth: 0.25,
  tipWidthFrac: 0.3,
  widthTaperPower: 1,
  thickness: 0.015,
  tipThicknessFrac: 0.43,
  bulgeStrength: 0.08,
  // With tipScale > 1 the tips reach past their own face's edge; the tip
  // dip pulls exactly those overreaching ends back toward the sphere
  // center, so they duck UNDER the neighboring star's surface instead of
  // hovering above it.
  tipDipStrength: 0.3,
  surfTwistDeg: -15,
  // With rotation + reach + dip, the arms THEMSELVES weave under their
  // neighbors - the separate ribbon connectors from the earlier tip-to-tip
  // wiring are redundant visual clutter on top of that, so they default
  // off (toggle below to compare).
  showRibbons: false,
  // Borrowed from the earlier Quin raymarched study ("OFFSET (star
  // rotation)" there, default 23 deg): rotating every star about its own
  // face normal makes each arm point at a GAP between two arms of the
  // (equally rotated) neighboring star instead of at the shared pentagon
  // vertex - the geometric precondition for arms diving under their
  // neighbors. tipScale (that study's "TIP RADIUS") additionally lets the
  // arms physically reach past their own face's edge into the neighbor's
  // territory.
  starRotationDeg: 23,
  tipScale: 1.05,
  ribbonWidthFactor: 1.15,
  ribbonTwistTurns: 0.4,
  ribbonDepthFraction: 0.94,
  ribbonLeaveFraction: 0.06,
  armpitRadiusFrac: 0.45,
  armpitNeighborOffset: 1,
};

/**
 * A point in the gap ("armpit") between arm `armIndex` and its neighbor
 * (`armIndex + neighborOffset`) on `face`, at radius `radiusFrac * R_out` -
 * NOT on any arm's surface. Built with the exact same bulge/twist/tip-dip
 * pipeline `buildSpiralStar`'s arms use (via the same `applySurfaceTwist`/
 * `applyTipDip` from geometry.js), so it sits on the same surface language,
 * just at an angle no arm actually sweeps through.
 *
 * Per user reference photos: a connection shouldn't land ON the
 * neighboring face's arm tip (that reads as the ribbon just butting into
 * the arm) - it should aim for this gap instead, then dip under the
 * neighboring star's body, the way the ribbon's own inward mid-dip
 * (`depthFraction` in ribbon.js) already pulls its middle inward relative
 * to its endpoints.
 */
function armpitPoint(face, armIndex, neighborOffset, radiusFrac) {
  const R = face.R_out;
  // The neighbor's arms rotate with starRotationDeg, so its gaps do too -
  // the armpit angle must track the same rotation the arms get.
  const armAngle = (armIndex * Math.PI * 2) / 5 + THREE.MathUtils.degToRad(params.starRotationDeg);
  const angle = armAngle + (neighborOffset * Math.PI * 2) / 5 / 2;
  const r = R * radiusFrac;
  const u = r * Math.cos(angle);
  const w = r * Math.sin(angle);
  const bulge = params.bulgeStrength ? params.bulgeStrength * (1 - Math.pow(r / R, 2)) : 0;
  const surfTwistRad = THREE.MathUtils.degToRad(params.surfTwistDeg);
  const world = face.center.clone().add(applySurfaceTwist(face, u, w, bulge, surfTwistRad));
  applyTipDip(world, r, face, params.tipDipStrength);
  return world;
}

const LABEL_RE = /^F(\d+)-A(\d+)$/;

let starGroup = null;
let ribbonGroup = null;

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
}

function rebuild() {
  if (starGroup) {
    scene.remove(starGroup);
    disposeGroup(starGroup);
  }
  if (ribbonGroup) {
    scene.remove(ribbonGroup);
    disposeGroup(ribbonGroup);
  }

  starGroup = new THREE.Group();
  ribbonGroup = new THREE.Group();

  /** @type {Map<string, {position: THREE.Vector3, outDir: THREE.Vector3, tangent: THREE.Vector3, label: string}>} */
  const tipsByLabel = new Map();

  for (const face of faces) {
    const { geometry, arms } = buildSpiralStar(face, { armCount: 5, ...params });
    starGroup.add(new THREE.Mesh(geometry, starMaterial));

    for (const arm of arms) {
      const tipPos = arm.points[0].clone();
      const nextPos = arm.points[1].clone();
      // Points outward, continuing the arm's own trend past its tip - same
      // convention geometry.js's buildStar uses for its own tip.tangent.
      const tangent = tipPos.clone().sub(nextPos).normalize();
      const outDir = tipPos.clone().sub(face.center).normalize();
      const label = `F${face.index}-A${arm.armIndex}`;
      tipsByLabel.set(label, { position: tipPos, outDir, tangent, label });
    }
  }

  const R = faces[0].R_out;
  const tipHalfWidth = R * params.bandHalfWidth * params.tipWidthFrac;
  const tipThickness = R * params.thickness * params.tipThicknessFrac;

  let missing = 0;
  for (const { a, b } of (params.showRibbons ? connections : [])) {
    const tipA = tipsByLabel.get(a);
    const bMatch = b.match(LABEL_RE);
    if (!tipA || !bMatch) {
      missing++;
      continue;
    }
    const faceB = faces[parseInt(bMatch[1], 10)];
    const armIndexB = parseInt(bMatch[2], 10);
    const landing = armpitPoint(faceB, armIndexB, params.armpitNeighborOffset, params.armpitRadiusFrac);
    const landingOutDir = landing.clone().sub(faceB.center).normalize();
    const tipB = { position: landing, outDir: landingOutDir, tangent: landingOutDir, label: b };

    const { geometry } = buildRibbon(tipA, tipB, {
      tubeRadius: tipHalfWidth,
      halfWidth: tipHalfWidth * params.ribbonWidthFactor,
      thickness: tipThickness,
      endThickness: tipThickness,
      twistTurns: params.ribbonTwistTurns,
      depthFraction: params.ribbonDepthFraction,
      // These arms barely curl (low `turns`), so each tip's own tangent
      // points almost purely radially outward (measured ~97% aligned with
      // outDir) rather than tangentially along the surface like the old
      // thin-arm star's swirled tips did. Following that tangent for the
      // usual leaveFraction launches the ribbon far outside the sphere
      // before it curves back toward its neighbor, tangling the whole
      // structure into a spiky cage - a much shorter leave keeps it close
      // to the surface instead.
      leaveFraction: params.ribbonLeaveFraction,
    });
    ribbonGroup.add(new THREE.Mesh(geometry, ribbonMaterial));
  }

  scene.add(starGroup);
  scene.add(ribbonGroup);

  document.getElementById('metrics').innerHTML =
    `Faces: ${faces.length}<br>` +
    `Connections: ${params.showRibbons ? `${connections.length} ribbons${missing ? ` (${missing} missing tips!)` : ''}` : 'arms weave directly (ribbons off)'}<br>` +
    `Tips resolved: ${tipsByLabel.size} / 60`;
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
bindSlider('ribbonWidthFactor', 'ribbonWidthFactor');
bindSlider('ribbonTwistTurns', 'ribbonTwistTurns');
bindSlider('ribbonDepthFraction', 'ribbonDepthFraction');
bindSlider('ribbonLeaveFraction', 'ribbonLeaveFraction');
bindSlider('armpitRadiusFrac', 'armpitRadiusFrac');
bindSlider('armpitNeighborOffset', 'armpitNeighborOffset');

document.getElementById('showRibbons').addEventListener('change', (e) => {
  params.showRibbons = e.target.checked;
  rebuild();
});

rebuild();

window.__spiralDodeca = {
  params,
  setStarsVisible(v) { starGroup.visible = v; },
  setRibbonsVisible(v) { ribbonGroup.visible = v; },
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
};

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
