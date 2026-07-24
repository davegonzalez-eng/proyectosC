// Stardreams: the full 12-face dodecahedron wearing the 5-arm spiral-star
// motif - each star built as ONE solid, smoothly-fused sheet
// (buildSolidStar2D + mapSolidStarToFace in spiralarm.js) instead of 5
// overlapping slabs, with material presets and hex/coral perforation
// patterns, and connected by 20 "circular horn triangle" arcs
// (buildHornArc) tracing tip-to-tip around each three-face corner.
//
// The connection pairs come from computeAdjacentFaceConnections() in
// geometry.js, unchanged - the rule reverse-engineered from the user's
// reference sequences for face 7 and face 1 in the original project
// (F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1 ...).
//
// A separate, standalone page (not wired into index.html/main.js) so the
// original 60-thin-arm sculpture keeps working untouched while this is
// judged on its own - see spiral-dodeca-prototype.html.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildDodecahedron, computeAdjacentFaceConnections } from './geometry.js';
import { buildSolidStar2D, mapSolidStarToFace, buildHornArc, buildStarRim, mapArmCenterlineWithNormal, hornArcPointAt } from './spiralarm.js';
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
  thickness: 0.01,
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
  // Connections: "circular horn triangles" - the adjacency rule's 60
  // pairs chain into 20 closed 3-cycles (one per dodecahedron vertex), so
  // one tangent-matched arc per pair assembles 20 deltoid-like curved
  // triangles whose sides run parallel to the star arms they pass,
  // rendered as slim beads in the rim's own width/material.
  showExtensions: true,
  extLengthFactor: 0.55,
  extDepthFraction: 0.95,
  extArcWidthFrac: 0.04,
  extClothoid: 1,
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
  // Debug: click a face to hide it (its star sheet + rim).
  debugFacePick: true,
  // Cross-section clipping plane.
  clipEnabled: false,
  clipAxis: 'z',
  clipOffset: -0.22,
  clipFlip: false,
  // Flyover: an automated camera tour hugging the outside of each arm out
  // to its tip, one side of the horn triangle across to the next star,
  // then back across that star's face and out along its own next arm -
  // looping continuously through several faces. Speed is a multiplier on
  // the nominal 34s lap (negative rewinds, 0 pauses); starts slow (1/3)
  // so the first view of it reads as a leisurely tour, not a blur.
  flyoverMode: false,
  flyoverSpeed: 0.33,
};

let starGroup = null;
let extGroup = null;
let rimGroup = null;
let flyoverCurve = null;
let flyoverLookOffsets = null;
let flyoverNormals = null;
let flyoverSpeedMultipliers = null;

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

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

// Flyover: a closed camera path built from the same geometry the render
// pipeline uses - not an approximation. Starting at one arm's tip, each
// "hop" (a) flies that arm inward toward its hub ("to the star face"),
// (b) picks the next arm on that same face and flies back OUT to its tip
// ("back inside following the next arm"), (c) follows one side of that
// tip's horn triangle over to a neighboring star's tip ("turns right to
// continue to the tip of the adjacent star"), (d) once outside on that
// neighbor's tip again, pulls up and out into a wide "orbit flourish"
// around that whole star (rotating ~4/5 of the way around while looking
// down at it) before settling back down to the exact hover height/tilt
// the arm segments use, then repeats from there. Preceded by a short
// establishing approach (far -> aligned with the first arm's outward
// tangent -> the tip itself) so the loop's first beat reads as
// "approaches, tilts parallel to a star arm, and zooms in."
//
// Arm segments hover just OUTSIDE the star's external surface along its
// TRUE local normal (`mapArmCenterlineWithNormal`), not the sphere-radial
// direction - measured up to ~27 degrees apart right where the exponential
// tip-bend curls the surface near a tip, which is exactly where a radial
// hover let the camera clip under the shell right after the approach.
// Hovering along the real normal keeps the camera genuinely skimming the
// visible top of the arm the whole way, tip included - reading as gliding
// through the gap between one star's arm and its neighbor rather than
// ducking beneath it. A constant gentle downward gaze tilt (applied every
// frame in updateFlyoverCamera, adjustable live with Arrow Up/Down)
// reinforces the "low flyover" read. The horn-arc segments are the one
// place that genuinely dips underneath a neighboring star (their own
// mid-span `depthFraction` squash already does that) - "the small space
// where it goes underneath the adjacent star" - so those points get a
// small sideways push (to the right, relative to travel direction) baked
// into their position, windowed smoothly across the arc (zero at both
// cusps) so it ramps in and out rather than popping. `lookOffsets`, a
// parallel array of world-space bias vectors (zero except across those
// same arc stretches, pointing the opposite lateral direction - left),
// lets the per-frame lookAt counter-tilt the gaze without a second
// geometry pass. `normals`, another parallel array (the true local normal
// for arm points, sphere-radial as a fallback for the approach/arc points
// which have no local (u,w) frame of their own), drives both the hover
// offset already baked into `points` and the camera's own banking at
// playback time. `speedMultipliers`, a fourth parallel array, scales how
// fast `flyoverT` advances at each point: slower near an arm's tip (the
// thinnest part of the star), slower still through the horn-arc maneuver,
// then faster as the arc's tail emerges from underneath back onto the
// next star's main surface - a pace the orbit flourish's zoom-out
// continues before easing back to the default cruising speed.
function buildFlyoverPath(star2D, faces, tipsByLabel, connections, params) {
  const R = star2D.R;
  // `mapStarPoint` (and so `mapArmCenterlineWithNormal`) returns the star
  // sheet's MIDPLANE, not its outer surface - the sheet has real thickness
  // (top/bottom sheets each offset by params.thickness/2 off that midplane
  // in mapSolidStarToFace), plus - right near the tip, where the boundary
  // passes close to the centerline - the rim bead's own proud height on
  // top of that. A fixed hover distance that doesn't clear BOTH of those
  // leaves the camera sandwiched between the two sheets: reported as
  // "going under by a tiny bit" and a "showing double" artifact near the
  // tip (the camera behind the alpha-tested top sheet, looking at both its
  // underside and whatever peeks through the perforation holes above it).
  // Computed from the actual current slab/rim params (not a fixed
  // constant) so it stays correct if those sliders change, plus a margin.
  const halfThickness = (params.thickness ?? 0.015) / 2;
  const rimBump = params.showRim ? (params.rimProudFrac ?? 0) : 0;
  const hoverFrac = halfThickness + rimBump + 0.02;
  const armCount = 5;

  const neighbors = new Map();
  const addNeighbor = (label, other) => {
    if (!neighbors.has(label)) neighbors.set(label, []);
    neighbors.get(label).push(other);
  };
  for (const { a, b } of connections) {
    addNeighbor(a, b);
    addNeighbor(b, a);
  }
  const parseLabel = (label) => {
    const m = /^F(\d+)-A(\d+)$/.exec(label);
    return { faceIdx: +m[1], armIdx: +m[2] };
  };

  const points = [];
  const lookOffsets = [];
  const normals = [];
  const speedMultipliers = [];
  const zero = new THREE.Vector3();
  const pushPoint = (p, normal, offset = zero, speed = 1) => {
    points.push(p);
    normals.push(normal);
    lookOffsets.push(offset);
    speedMultipliers.push(speed);
  };
  // Arm segments run slower near the tip - the thinnest, narrowest part of
  // the star - ramping up to full speed by the hub. `frames` is always
  // tip-first regardless of travel direction, so the taper is keyed off
  // each frame's own index in that original array, not push order.
  const ARM_TIP_SPEED = 0.55;
  const armSpeedAt = (origFrac) => ARM_TIP_SPEED + (1 - ARM_TIP_SPEED) * smoothstep(origFrac / 0.3);
  const pushArm = (frames, reverse) => {
    const seq = reverse ? frames.slice().reverse() : frames;
    const n = frames.length;
    seq.forEach(({ point, normal }, i) => {
      const origIdx = reverse ? n - 1 - i : i;
      const speed = armSpeedAt(n > 1 ? origIdx / (n - 1) : 1);
      pushPoint(point.clone().addScaledVector(normal, hoverFrac * R), normal, zero, speed);
    });
  };

  const startLabel = 'F0-A0';
  const startTip = tipsByLabel.get(startLabel);
  const outward0 = startTip.tipPosition.clone().normalize();
  pushPoint(startTip.tipPosition.clone().addScaledVector(outward0, R * 5).add(new THREE.Vector3(R * 1.4, R * 0.7, 0)), outward0);
  const midApproach = startTip.tipPosition.clone().addScaledVector(startTip.tipTangent, R * 1.1).addScaledVector(outward0, R * 0.6);
  pushPoint(midApproach, midApproach.clone().normalize());
  const closeApproach = startTip.tipPosition.clone().addScaledVector(startTip.tipTangent, R * 0.25);
  pushPoint(closeApproach, closeApproach.clone().normalize());

  let currentLabel = startLabel;
  const numHops = 10;
  const arcSamples = 24;
  // Horn-arc speed profile: normal pace leaving the tip, slow through the
  // "maneuvering around the triangle" midsection, then ramping up toward
  // the far tip - that ramp up IS "emerging from underneath back to the
  // main surface," so it's already fast by s = 1, and the flourish below
  // continues easing off that same fast pace rather than starting cold.
  const ARC_SLOW_SPEED = 0.4;
  const ARC_EMERGE_SPEED = 1.5;
  const arcSpeedAt = (s) => {
    if (s < 0.15) return 1 - (1 - ARC_SLOW_SPEED) * smoothstep(s / 0.15);
    if (s < 0.75) return ARC_SLOW_SPEED;
    return ARC_SLOW_SPEED + (ARC_EMERGE_SPEED - ARC_SLOW_SPEED) * smoothstep((s - 0.75) / 0.25);
  };
  for (let hop = 0; hop < numHops; hop++) {
    const { faceIdx, armIdx } = parseLabel(currentLabel);
    const face = faces[faceIdx];

    // (a) fly this arm tip -> hub, hovering just outside its true
    // external surface ("to the star face").
    pushArm(mapArmCenterlineWithNormal(star2D, face, armIdx, params), false);

    // (b) pick the next arm on the same face, fly hub -> tip, same
    // external hover ("back inside following the next arm").
    const nextArmIdx = (armIdx + 1) % armCount;
    pushArm(mapArmCenterlineWithNormal(star2D, face, nextArmIdx, params), true);

    const nextLabel = `F${faceIdx}-A${nextArmIdx}`;
    const nextTip = tipsByLabel.get(nextLabel);

    // (c) follow one side of that tip's horn triangle to a neighboring
    // star's tip, alternating which of the two sides across hops for
    // variety ("turns right to continue to the tip of the adjacent star").
    const options = neighbors.get(nextLabel);
    const chosenLabel = options[hop % options.length];
    const chosenTip = tipsByLabel.get(chosenLabel);
    const arcFn = hornArcPointAt(nextTip, chosenTip, {
      lengthFactor: params.extLengthFactor,
      depthFraction: params.extDepthFraction,
      clothoidFactor: params.extClothoid,
    });
    // Same "don't fly through the solid material" fix as the arm hover:
    // arcFn returns the horn-arc TUBE's own centerline, which has a real
    // cross-section radius (arcHeight/2 = R*max(rimProudFrac,0.005) in
    // rebuild()'s buildHornArc call) - hovering right on it puts the
    // camera inside the tube. Clear it with the same margin.
    const arcHoverFrac = Math.max(params.rimProudFrac ?? 0, 0.005) + 0.02;
    let lastArcPoint = null;
    let lastArcNormal = null;
    for (let i = 0; i <= arcSamples; i++) {
      const s = i / arcSamples;
      const p = arcFn(s);
      const tangent = arcFn(Math.min(s + 1e-3, 1)).sub(arcFn(Math.max(s - 1e-3, 0))).normalize();
      const outward = p.clone().normalize();
      let right = new THREE.Vector3().crossVectors(tangent, outward);
      if (right.lengthSq() < 1e-10) right.set(1, 0, 0); else right.normalize();
      const w = Math.sin(Math.PI * s); // 0 at both cusps, 1 at mid-arc
      const hovered = p.clone().addScaledVector(outward, arcHoverFrac * R).addScaledVector(right, R * 0.07 * w);
      pushPoint(hovered, outward, right.clone().multiplyScalar(-R * 0.18 * w), arcSpeedAt(s));
      lastArcPoint = hovered;
      lastArcNormal = outward;
    }

    // (d) orbit flourish: having just emerged from underneath the arc back
    // onto `chosenLabel`'s star, pull up and out, sweep ~4/5 of the way
    // around that whole face while looking down at it from above, then
    // spend the remaining ~1/5 of the turn descending back down to the
    // exact hover point/normal the next hop's arm traversal starts from -
    // so the loop stays perfectly continuous into (a) above, next time
    // through, with no seam.
    const { faceIdx: newFaceIdx, armIdx: newArmIdx } = parseLabel(chosenLabel);
    const orbitFace = faces[newFaceIdx];
    const chosenFrames = mapArmCenterlineWithNormal(star2D, orbitFace, newArmIdx, params);
    const targetPoint = chosenFrames[0].point.clone().addScaledVector(chosenFrames[0].normal, hoverFrac * R);
    const targetNormal = chosenFrames[0].normal;
    const tipAngle = Math.atan2(chosenTip.tipPosition.dot(orbitFace.W), chosenTip.tipPosition.dot(orbitFace.U));
    // Kept modest: the face's own "radius" (R_out) already reaches past the
    // star's tips, and faces sit close together around the dodecahedron, so
    // even a lift of one whole R_out along the face normal is enough to
    // clear the entire sculpture's silhouette, not just this one star -
    // read as flying off into empty space rather than orbiting above it.
    const orbitRadius = orbitFace.R_out * 1.15; // just past the star's own tips
    const orbitHeight = orbitFace.R_out * 0.35; // pulled back, still close over the surface
    const orbitPoint = (angle, height) => orbitFace.center.clone()
      .addScaledVector(orbitFace.U, Math.cos(angle) * orbitRadius)
      .addScaledVector(orbitFace.W, Math.sin(angle) * orbitRadius)
      .addScaledVector(orbitFace.normal, height);

    // The normal per-point look scheme (`updateFlyoverCamera` aiming at the
    // curve's own next point, plus a couple-percent downward-tilt bias) is
    // built for hugging a surface nose-first - it can't swing the gaze
    // ~80 degrees down and inward, which is what looking AT the star from
    // this wide orbit needs. So orbit points bake a large explicit
    // `lookOffset` (pushPoint's 3rd argument), added on top of that default
    // lookahead, that pulls the gaze the rest of the way to the face's
    // center - the difference between where the default scheme would look
    // and where the orbit actually wants to look.
    // Scaled up a bit past an exact match to the lookahead-to-center vector:
    // the lookahead point this gets added to is itself a little further
    // along the orbit (not exactly `orbitPoint(angle, height)`), so a small
    // overshoot keeps the gaze solidly on the star rather than just barely
    // grazing it at the frame edge.
    const lookAtCenterOffset = (angle, height) => orbitFace.center.clone().sub(orbitPoint(angle, height)).multiplyScalar(1.4);

    // Zoom out + tilt down: blend from the arc's landing spot/normal up to
    // the wide orbit position/attitude, easing the fast "emerging" speed
    // back down to the default cruising pace, and easing the gaze from
    // plain forward-hugging flight into the orbit's "look at the star" bias.
    const zoomSamples = 16;
    for (let i = 1; i <= zoomSamples; i++) {
      const t = smoothstep(i / zoomSamples);
      const pos = lastArcPoint.clone().lerp(orbitPoint(tipAngle, orbitHeight), t);
      const normal = lastArcNormal.clone().lerp(orbitFace.normal, t).normalize();
      const speed = ARC_EMERGE_SPEED + (1 - ARC_EMERGE_SPEED) * t;
      const offset = lookAtCenterOffset(tipAngle, orbitHeight).multiplyScalar(t);
      pushPoint(pos, normal, offset, speed);
    }

    // Orbit cruise: ~4/5 of a full turn at constant height, gaze locked
    // onto the face center throughout - reads as circling the star and
    // looking down at it, not just flying its own tangent forward.
    const cruiseSamples = 90;
    const cruiseSpan = Math.PI * 2 * 0.8;
    for (let i = 1; i <= cruiseSamples; i++) {
      const angle = tipAngle + cruiseSpan * (i / cruiseSamples);
      const offset = lookAtCenterOffset(angle, orbitHeight);
      pushPoint(orbitPoint(angle, orbitHeight), orbitFace.normal.clone(), offset, 1);
    }

    // Descend + tilt back up: spend the remaining ~1/5 of the turn easing
    // position/normal back down to the default hover state - and easing the
    // gaze's "look at center" bias back to zero in step, so it hands off
    // smoothly to the next hop's plain forward-hugging look. Stops just
    // short of an exact position match so the next hop's first arm sample
    // (which IS that exact point) supplies the seam without a duplicate
    // control point.
    const descendSamples = 24;
    const descendSpan = Math.PI * 2 - cruiseSpan;
    const cruiseEndAngle = tipAngle + cruiseSpan;
    const descendDenom = descendSamples + 1;
    for (let i = 1; i <= descendSamples; i++) {
      const t = smoothstep(i / descendDenom);
      const angle = cruiseEndAngle + descendSpan * (i / descendDenom);
      const pos = orbitPoint(angle, orbitHeight).lerp(targetPoint, t);
      const normal = orbitFace.normal.clone().lerp(targetNormal, t).normalize();
      const offset = lookAtCenterOffset(angle, orbitHeight).multiplyScalar(1 - t);
      pushPoint(pos, normal, offset, 1);
    }

    currentLabel = chosenLabel;
  }

  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.4);
  // getPointAt()'s constant-speed traversal depends on an arc-length LUT
  // built by sampling `arcLengthDivisions` points UNIFORMLY IN RAW
  // PARAMETER, not in point count - the default (200) is far coarser than
  // this curve's ~1200+ wildly unevenly-spaced control points (a handful
  // of sparse, very long "approach" jumps next to hundreds of tightly
  // packed arm/arc samples). With too few divisions, a whole cluster of
  // real control points can fall inside a single LUT interval, whose
  // length is then measured as the straight-line CHORD between its two
  // endpoints - badly underestimating true arc length wherever the path
  // winds a lot in that stretch. That mismeasurement is exactly what let
  // small t values warp straight past the sparse, long approach jump into
  // the dense hop section (confirmed by sampling getPointAt at small t
  // before this fix and finding close-up interior geometry instead of the
  // intended far establishing shot). Enough divisions to comfortably
  // exceed the point count fixes it.
  curve.arcLengthDivisions = points.length * 4;
  return { curve, lookOffsets, normals, speedMultipliers };
}

function rebuild() {
  for (const g of [starGroup, extGroup, rimGroup]) {
    if (g) {
      scene.remove(g);
      disposeGroup(g);
    }
  }
  starGroup = new THREE.Group();
  extGroup = new THREE.Group();
  rimGroup = new THREE.Group();

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

    for (const arm of arms) {
      tipsByLabel.set(`F${face.index}-A${arm.armIndex}`, arm);
    }
  }

  const R = faces[0].R_out;

  let missing = 0;
  if (params.showExtensions) {
    for (const { a, b } of connections) {
      const tipA = tipsByLabel.get(a);
      const tipB = tipsByLabel.get(b);
      if (!tipA || !tipB) {
        missing++;
        continue;
      }
      // Sized off the rim, drawn with the rim's (never-perforated)
      // material: the horn triangles read as the rim bead continuing off
      // the arm tips across the gaps, not as separate structural ribbon.
      const { geometry } = buildHornArc(tipA, tipB, {
        arcWidth: R * params.extArcWidthFrac,
        arcHeight: R * Math.max(params.rimProudFrac, 0.005) * 2,
        lengthFactor: params.extLengthFactor,
        depthFraction: params.extDepthFraction,
        clothoidFactor: params.extClothoid,
      });
      extGroup.add(new THREE.Mesh(geometry, rimMaterial));
    }
  }

  scene.add(starGroup);
  scene.add(extGroup);
  scene.add(rimGroup);
  applyHiddenFaces();

  document.getElementById('metrics').innerHTML =
    `Faces: ${faces.length} | Tips: ${tipsByLabel.size}/60<br>` +
    `Extensions: ${params.showExtensions ? `${connections.length - missing}${missing ? ` (${missing} missing!)` : ''}` : 'off'}`;

  const listEl = document.getElementById('conn-list');
  if (listEl) {
    listEl.textContent = connections.map(({ a, b }) => `${a} -> ${b}`).join('\n');
  }

  ({ curve: flyoverCurve, lookOffsets: flyoverLookOffsets, normals: flyoverNormals, speedMultipliers: flyoverSpeedMultipliers } = buildFlyoverPath(star2D, faces, tipsByLabel, connections, params));
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
bindSlider('extLengthFactor', 'extLengthFactor');
bindSlider('extDepthFraction', 'extDepthFraction');
bindSlider('extArcWidthFrac', 'extArcWidthFrac');
bindSlider('extClothoid', 'extClothoid');
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
document.getElementById('flyoverMode').addEventListener('change', (e) => {
  setFlyoverMode(e.target.checked);
});
document.getElementById('flyoverSpeed').addEventListener('input', (e) => {
  params.flyoverSpeed = parseFloat(e.target.value);
  document.getElementById('v-flyoverSpeed').textContent = params.flyoverSpeed;
});
document.getElementById('panel-toggle').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
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

// Flyover camera: OrbitControls is disabled while active (both drive the
// same camera) and the default view is restored on exit so control hands
// back cleanly rather than snapping to wherever OrbitControls last thought
// the camera was.
const DEFAULT_CAMERA_POS = camera.position.clone();
const FLYOVER_DURATION_S = 34; // nominal lap time at speed = 1
// Baseline "look slightly down at the terrain" bias. User found empirically
// that thickness=0.01 plus 4 Arrow-Up presses (4 * -FLYOVER_TILT_STEP off the
// old 0.1 baseline) keeps the camera clear of the surface through nearly the
// whole loop, so that combination is now the zero-offset default.
const FLYOVER_DOWNWARD_TILT_FRAC = 0.1 - 4 * 0.03;
const FLYOVER_TILT_STEP = 0.03; // per-keypress Arrow Up/Down nudge
const FLYOVER_TILT_MAX = 0.4; // clamp so the gaze can't flip past looking straight up/down
// Position along the loop (0..1) and the wall-clock time it was last
// advanced - kept as running state (not derived from a single start
// timestamp) so `flyoverSpeed` can change - including going negative, for
// rewinding, or 0, to pause - at any moment without discontinuities.
let flyoverT = 0;
let flyoverLastMs = null;
// User-adjustable ADD-ON to the baseline downward tilt (Arrow Down adds,
// Arrow Up subtracts) - lets the gaze go from looking below the sphere's
// "horizon" (down into the surface) to above it (out past the rim), on
// top of whatever baseline tilt this build already has.
let flyoverTiltOffset = 0;
// Speed to restore on resume - whatever was set (via slider or default)
// the moment Space paused it - so pausing/resuming never loses the
// user's chosen speed the way just remembering a hardcoded default would.
let flyoverSpeedBeforePause = null;
function setFlyoverMode(on) {
  params.flyoverMode = on;
  controls.enabled = !on;
  if (on) {
    flyoverT = 0;
    flyoverLastMs = null; // no dt on the first frame after (re)enabling
    flyoverSpeedBeforePause = null;
  } else {
    camera.position.copy(DEFAULT_CAMERA_POS);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }
}
window.addEventListener('keydown', (e) => {
  if (!params.flyoverMode) return;
  if (e.key === 'ArrowDown') {
    flyoverTiltOffset = Math.min(FLYOVER_TILT_MAX, flyoverTiltOffset + FLYOVER_TILT_STEP);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    flyoverTiltOffset = Math.max(-FLYOVER_TILT_MAX, flyoverTiltOffset - FLYOVER_TILT_STEP);
    e.preventDefault();
  } else if (e.code === 'Space') {
    if (params.flyoverSpeed !== 0) {
      flyoverSpeedBeforePause = params.flyoverSpeed;
      params.flyoverSpeed = 0;
    } else {
      params.flyoverSpeed = flyoverSpeedBeforePause || 0.33;
      flyoverSpeedBeforePause = null;
    }
    syncControl('flyoverSpeed');
    e.preventDefault();
  }
});
// Linear-interpolated lookup into one of the parallel per-point arrays
// (lookOffsets, normals) at the curve's raw parameter `u` - shared by both
// since they're built with exactly the same length/order as `points`.
function sampleFlyoverArray(arr, u) {
  const n = arr.length;
  const idxF = u * n;
  const i0 = Math.floor(idxF) % n;
  const i1 = (i0 + 1) % n;
  const frac = idxF - Math.floor(idxF);
  return arr[i0].clone().lerp(arr[i1], frac);
}
// Same linear-interpolated lookup as `sampleFlyoverArray`, for the plain
// numeric `speedMultipliers` array (no `.clone()`/`.lerp()` Vector3 API).
function sampleFlyoverScalar(arr, u) {
  const n = arr.length;
  const idxF = u * n;
  const i0 = Math.floor(idxF) % n;
  const i1 = (i0 + 1) % n;
  const frac = idxF - Math.floor(idxF);
  return arr[i0] + (arr[i1] - arr[i0]) * frac;
}
function updateFlyoverCamera() {
  if (!flyoverCurve) return;
  const nowMs = performance.now();
  if (flyoverLastMs !== null) {
    const dtSec = (nowMs - flyoverLastMs) / 1000;
    // Local speed (baked in per point - slow at tips/horn-arc, fast
    // emerging) scales the base flyoverSpeed rather than replacing it, so
    // pause (0) and rewind (negative) still work everywhere along the loop.
    const uNow = flyoverCurve.getUtoTmapping(flyoverT);
    const localSpeed = flyoverSpeedMultipliers ? sampleFlyoverScalar(flyoverSpeedMultipliers, uNow) : 1;
    flyoverT += (dtSec / FLYOVER_DURATION_S) * params.flyoverSpeed * localSpeed;
    flyoverT = ((flyoverT % 1) + 1) % 1; // wrap correctly for negative (rewind) too
  }
  flyoverLastMs = nowMs;

  const dir = params.flyoverSpeed < 0 ? -1 : 1; // look the way we're actually travelling, even in reverse
  const pos = flyoverCurve.getPointAt(flyoverT);
  const lookPos = flyoverCurve.getPointAt((flyoverT + dir * 0.003 + 1) % 1);
  const u = flyoverCurve.getUtoTmapping(flyoverT);

  // The true local surface normal at this point (interpolated between the
  // two nearest baked-in samples) - used for both banking (up) and the
  // downward-tilt reference, instead of the sphere-radial approximation,
  // so both track the actual curled surface near a tip rather than the
  // sphere's geometric center.
  const normal = sampleFlyoverArray(flyoverNormals, u).normalize();

  // Blend in the baked-in lateral gaze bias (left, during horn-arc
  // "underneath the adjacent star" passes; zero elsewhere), looked up at
  // the same raw curve parameter so it lines up with the arc stretches
  // that baked in the matching rightward position shift.
  lookPos.add(sampleFlyoverArray(flyoverLookOffsets, u));

  // Downward tilt - like a low-altitude flyover looking a touch toward the
  // terrain rather than dead level along the flight path - baseline plus
  // whatever the user has nudged live with Arrow Up/Down.
  lookPos.addScaledVector(normal, -(FLYOVER_DOWNWARD_TILT_FRAC + flyoverTiltOffset) * faces[0].R_out);

  camera.position.copy(pos);
  // Bank toward the true local surface normal rather than a fixed
  // world-up (or the coarser sphere-radial approximation), so the camera
  // tilts naturally as it hugs the sphere/arm surface instead of rolling
  // awkwardly through the dive-in/out turns.
  camera.up.copy(normal);
  camera.lookAt(lookPos);
}

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
    rebuild();
    if (partial.flyoverMode !== undefined) setFlyoverMode(partial.flyoverMode);
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  if (params.flyoverMode) updateFlyoverCamera();
  else controls.update();
  renderer.render(scene, camera);
}
animate();
