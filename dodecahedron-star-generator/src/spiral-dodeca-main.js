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
import { buildDodecahedron, computeAdjacentFaceConnections, computeThreeCycles } from './geometry.js';
import { buildSolidStar2D, mapSolidStarToFace, computeArmTips, buildHornArc, buildStarRim, mapArmCenterlineWithNormal, hornTriangleCenter, buildSnapHubGroup, buildSpiralVortexGroup, buildSpiralVortexRibbonGroup } from './spiralarm.js';
import { createPerforationTexture, createCoralMazeTexture } from './hextexture.js';

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
    let tex;
    if (params.pattern === 'coralMaze' || params.pattern === 'coralRidge') {
      // Two brain-coral-inspired meander presets (fine winding vs. wide
      // channels) - `holeSize` doubles as the tiny corallite pits' density
      // here, the same slider the hex patterns use for hole size, so
      // switching patterns doesn't need a second control.
      tex = createCoralMazeTexture({
        cellPx: 44,
        ridgeFreq: params.pattern === 'coralMaze' ? 7 : 4,
        warpAmp: params.pattern === 'coralMaze' ? 0.08 : 0.12,
        poreFrac: params.holeSize * 0.35,
      });
    } else {
      tex = createPerforationTexture({
        cellPx: 28,
        holeFrac: params.holeSize,
        jitter: params.pattern === 'coral' ? 0.45 : 0,
      });
    }
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
// The 60 pairs' 20 closed 3-cycles (one per dodecahedron vertex) - needed
// by anything that has to see all THREE tips of a "circular horn triangle"
// at once (the snap-joint hub piece, the Star Odyssey spiral connector),
// unlike `buildHornArc` which only ever looks at one pair at a time.
const threeCycles = computeThreeCycles(connections);

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
  // the nominal 34s lap (negative rewinds, 0 pauses); starts quite slow so
  // the star-face orbit flourish (the part worth lingering on) doesn't fly
  // past too quickly.
  flyoverMode: false,
  flyoverSpeed: 0.03,

  // --- Presets (see PRESETS below) ---
  // `preset` just tracks which dropdown entry is selected; the params it
  // actually drives are the ones below plus whatever shape/appearance
  // values the preset bundle overrides on top of this base object.
  preset: 'stardream1',
  // Single-face mode ("Stardream - 3D Printing"): render only
  // `faces[singleFaceIndex]`'s star (full mesh + rim), skipping the other
  // 11 - the preset's whole point is a detailed, print-oriented look at
  // ONE face, not the assembled sculpture.
  singleFaceMode: false,
  singleFaceIndex: 0,
  // Which connector geometry `rebuild()` builds: the original tip-to-tip
  // horn arc (Stardream #1), a peg+socket snap-joint hub piece at each
  // vertex touching the isolated face (3D Printing), or the Star Odyssey
  // spiral-to-center vortex (all 20 vertices).
  connectorStyle: 'hornArc',
  // Snap-joint sockets: a REAL through-hole cut into each arm tip (not the
  // alphaMap-texture perforation), sized for a peg pushed through the thin
  // printed sheet - see buildSolidStar2D's field-subtraction comment.
  snapEnabled: false,
  snapHoleRadiusFrac: 0.026,
  snapHoleInsetFrac: 0.11,
  // The separate small hub piece (peg + socket, corner-hub topology the
  // user chose): a rounded body at each triangle's center with 3 pegs
  // reaching toward the sockets above. Sized to read as slim as the old
  // horn-arc bead (extArcWidthFrac 0.04) rather than a chunky standalone
  // part - reported as "way too large/long" at the first sizing (0.07
  // body / 0.045 peg radius), which was noticeably fatter than the arc it
  // replaced even though the actual REACH (center to tip) is already well
  // under the triangle's own tip-to-tip span.
  hubBodyRadiusFrac: 0.035,
  snapPegRadiusFrac: 0.024,
  snapPegLengthFrac: 0.16,
  // Star Odyssey spiral-vortex connector shape. Turns/sweep both well
  // under the first version's 0.65/0.4 - that read as an unnecessary extra
  // loop at each vertex ("too curly"); this settles for a single gentle
  // swoop into the center instead of a visible coil.
  spiralTurns: 0.22,
  spiralSweepFrac: 0.22,
  // How far the connector curve's Bezier control point sits along the
  // tip's own outward tangent (as a fraction of the tip-to-center
  // distance) before the curve bends in toward the shared center - governs
  // how long the connector keeps going in the tip's own direction before
  // it starts visibly curving away, i.e. how far from the star the
  // "departure" reads as happening. Was hardcoded inside
  // `spiralVortexPointAt` (never actually reachable through `params`,
  // despite being destructured from `options` there) - exposed here so the
  // "connections meet the star closer/farther" control actually works.
  spiralLaunchFrac: 0.4,
  spiralArcWidthFrac: 0.035,
  // Star Odyssey "thick bands" connector shape: same spiral curve as
  // above, extruded as a flat ribbon instead of a tapering tube, with a
  // progressive twist (in half-turns) applied along its length.
  spiralRibbonWidthFrac: 0.09,
  spiralRibbonThicknessFrac: 0.012,
  spiralHalfTwists: 1,
};

// Three named parameter bundles, applied wholesale via setParams() from the
// preset dropdown. Each is a PARTIAL object - only the keys that differ
// from whatever's currently set - so switching presets can't leave stray
// values from a previous preset lying around unless it means to (e.g. going
// from 3D-Printing back to Stardream #1 explicitly turns singleFaceMode
// back off rather than just not mentioning it).
const PRESETS = {
  // The original sculpture, unchanged - every value here matches `params`
  // above exactly, so selecting this after fiddling with sliders resets
  // the whole shape back to the tuned default.
  stardream1: {
    starRotationDeg: 29, tipScale: 1.28, turns: 0.1, hubRadiusFrac: 0.24,
    bandHalfWidth: 0.23, tipWidthFrac: 0.12, widthTaperPower: 0.9,
    thickness: 0.01, tipThicknessFrac: 0.17, bulgeStrength: 0.16,
    tipDipStrength: 0.29, surfTwistDeg: -3, filletFrac: 0.1, subdivisions: 3,
    tipBendStrength: 0.12, tipBendTwistDeg: 37, tipBendPower: 5,
    showExtensions: true, extLengthFactor: 0.55, extDepthFraction: 0.95,
    extArcWidthFrac: 0.04, extClothoid: 1,
    showRim: true, rimWidthFrac: 0.02, rimProudFrac: 0.02,
    fieldGrid: 144,
    singleFaceMode: false, connectorStyle: 'hornArc', snapEnabled: false,
    // Every preset bundle sets its own appearance explicitly (not just
    // shape/mode params) - otherwise switching presets only ever changes
    // whatever keys THIS bundle happens to mention, leaving a previous
    // preset's material/pattern/lamp-mode stuck in place instead of each
    // preset being a complete, self-consistent look.
    material: 'golden', pattern: 'hex', holeSize: 0.24, patternScale: 3.2,
    lampMode: true, lampIntensity: 19,
  },
  // Focused on ONE detailed, printable face instead of the assembled
  // sculpture. Tip width/thickness are pulled way up from the display
  // defaults (0.12/0.17 -> 0.4/0.6) specifically so there's enough real
  // material at the tip to cut a snap-hole socket through and still print
  // a solid wall around it - see the printability assessment this
  // followed up on: at the DISPLAY defaults, even at a generous 250mm
  // print, the tip wall thickness measured under 0.15mm, well below a
  // single 0.4mm nozzle line. `fieldGrid`/`subdivisions` are bumped up too,
  // affordable now that only one face is being built instead of twelve.
  print3d: {
    starRotationDeg: 29, tipScale: 1.28, turns: 0.1, hubRadiusFrac: 0.24,
    bandHalfWidth: 0.26, tipWidthFrac: 0.4, widthTaperPower: 0.9,
    thickness: 0.03, tipThicknessFrac: 0.6, bulgeStrength: 0.16,
    tipDipStrength: 0.29, surfTwistDeg: -3, filletFrac: 0.1, subdivisions: 3,
    // The exponential tip-bend (dip + twist) exists purely to pre-angle the
    // DISPLAY tip to match the old horn-arc's incoming tangent - with a
    // straight peg instead of a curved arc there's nothing for it to match
    // any more, and at this preset's much wider/thicker tip it was reported
    // as a "weird head/protuberance" - an organic curl fighting a
    // mechanical mating surface. Off entirely so the tip (and its socket)
    // stays flat and predictable.
    tipBendStrength: 0, tipBendTwistDeg: 0, tipBendPower: 5,
    // The hub+peg pieces are gated by `showExtensions` just like every
    // other connector style (see rebuild()) - this preset's whole point is
    // showing them, so it must default the checkbox on, not off. Leaving it
    // off here previously meant the snap-hub/peg geometry never built at
    // all, which read as "the checkbox does nothing" even though the
    // checkbox itself worked fine once wired up.
    showExtensions: true, showRim: true, rimWidthFrac: 0.02, rimProudFrac: 0.02,
    // Only one face gets built in this mode, so a bit more resolution than
    // the display default (144) is affordable - mostly so the snap-hole
    // socket reads as a reasonably round circle rather than a coarse
    // octagon (fieldGrid's cell size sets how many marching-squares samples
    // fall across the hole's own small radius).
    fieldGrid: 180,
    singleFaceMode: true, singleFaceIndex: 0,
    connectorStyle: 'snapHub', snapEnabled: true,
    snapHoleRadiusFrac: 0.026, snapHoleInsetFrac: 0.11,
    hubBodyRadiusFrac: 0.035, snapPegRadiusFrac: 0.024, snapPegLengthFrac: 0.16,
    material: 'matteWhite', pattern: 'none', lampMode: false,
  },
  // Same star/arm geometry as Stardream #1 - the brief was to change how
  // the CONNECTIONS work, not the stars - but every horn-arc tip-to-tip
  // bow is replaced by a 3-way spiral vortex converging at that vertex's
  // "circular horn triangle" center.
  starOdyssey: {
    // Retuned to the user's own live-session values (starRotationDeg,
    // tipScale, hubRadiusFrac, bandHalfWidth, the spiral shape params, and
    // lampMode all moved off their original §25/§27 defaults). Second
    // round: hubRadiusFrac, tipWidthFrac, tipBendStrength/TwistDeg,
    // material, holeSize, and spiralArcWidthFrac retuned again.
    starRotationDeg: 19, tipScale: 1.14, turns: 0.1, hubRadiusFrac: 0.17,
    bandHalfWidth: 0.305, tipWidthFrac: 0.39, widthTaperPower: 0.9,
    thickness: 0.01, tipThicknessFrac: 0.17, bulgeStrength: 0.16,
    tipDipStrength: 0.29, surfTwistDeg: -3, filletFrac: 0.1, subdivisions: 3,
    tipBendStrength: 0.09, tipBendTwistDeg: 24, tipBendPower: 5,
    // Same reasoning as print3d's hub/peg pieces: the spiral funnels ARE
    // this preset's headline feature, so `showExtensions` must default to
    // true or they never get built - that, not a broken checkbox, was why
    // toggling "show horn arcs" looked like it did nothing here.
    showExtensions: true, showRim: true, rimWidthFrac: 0.02, rimProudFrac: 0.02,
    fieldGrid: 144,
    singleFaceMode: false, connectorStyle: 'spiralVortex', snapEnabled: false,
    spiralTurns: 0.1, spiralSweepFrac: 0.02, spiralArcWidthFrac: 0.075,
    material: 'matteWhite', pattern: 'hex', holeSize: 0.27, patternScale: 3.2,
    lampMode: false, lampIntensity: 19,
  },
  // A second Star Odyssey tuning, from the user's own live-session export
  // again - wider tips (tipWidthFrac 0.39->0.57), a smaller hub, gold
  // instead of matte white, and a wider spiral bead (spiralArcWidthFrac
  // 0.075->0.08) than `starOdyssey` above.
  odysseyThicker: {
    starRotationDeg: 14, tipScale: 1.14, turns: 0.1, hubRadiusFrac: 0.14,
    bandHalfWidth: 0.305, tipWidthFrac: 0.57, widthTaperPower: 0.9,
    thickness: 0.01, tipThicknessFrac: 0.17, bulgeStrength: 0.16,
    tipDipStrength: 0.29, surfTwistDeg: -3, filletFrac: 0.1, subdivisions: 3,
    tipBendStrength: 0.12, tipBendTwistDeg: 37, tipBendPower: 5,
    showExtensions: true, showRim: true, rimWidthFrac: 0.02, rimProudFrac: 0.02,
    fieldGrid: 144,
    singleFaceMode: false, connectorStyle: 'spiralVortex', snapEnabled: false,
    spiralTurns: 0.1, spiralSweepFrac: 0.02, spiralArcWidthFrac: 0.08,
    material: 'golden', pattern: 'hex', holeSize: 0.24, patternScale: 3.2,
    lampMode: false, lampIntensity: 19,
  },
  // Same star shape as `odysseyThicker` - the brief here was specifically
  // to change the CONNECTOR's cross-section, not the stars again - but
  // `connectorStyle: 'spiralRibbon'` extrudes each spiral as a flat, wide
  // band instead of a tapering tube, with a half-twist (Mobius-strip
  // style) along its length as it leaves the arm and spirals in to meet
  // the other two bands at the shared vertex center.
  odysseyThickBands: {
    starRotationDeg: 14, tipScale: 1.14, turns: 0.1, hubRadiusFrac: 0.14,
    bandHalfWidth: 0.305, tipWidthFrac: 0.57, widthTaperPower: 0.9,
    thickness: 0.01, tipThicknessFrac: 0.17, bulgeStrength: 0.16,
    tipDipStrength: 0.29, surfTwistDeg: -3, filletFrac: 0.1, subdivisions: 3,
    tipBendStrength: 0.12, tipBendTwistDeg: 37, tipBendPower: 5,
    showExtensions: true, showRim: true, rimWidthFrac: 0.02, rimProudFrac: 0.02,
    fieldGrid: 144,
    singleFaceMode: false, connectorStyle: 'spiralRibbon', snapEnabled: false,
    spiralTurns: 0.1, spiralSweepFrac: 0.02,
    spiralRibbonWidthFrac: 0.09, spiralRibbonThicknessFrac: 0.05, spiralHalfTwists: 1,
    material: 'golden', pattern: 'hex', holeSize: 0.24, patternScale: 3.2,
    lampMode: false, lampIntensity: 19,
  },
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

// Both flourish descends decay their "look at the pivot" gaze offset via
// `1 - t^2` so it holds close to full strength through most of the descent
// (avoiding the under-corrected middle stretch a straight linear falloff
// caused) - but `1 - t^2` at t=0.96 (a couple of samples before the very
// end) is still ~8% of the offset's FULL strength, and that offset's own
// magnitude is sized off the whole flourish's orbit radius, not off how
// close the camera has gotten to the tip. By the time t is that close to 1,
// position/normal have already converged onto the tip itself - the
// thinnest, narrowest part of the star - so an 8%-strength offset sized for
// a whole-orbit-radius swing is still big enough in absolute terms to swing
// the look target clean off that sliver of geometry into the black
// background behind it (confirmed with a raycast/screenshot sweep: a
// genuinely empty frame right in this stretch, at ~90% through the
// horn-triangle crossing's landing descend - matching the reported "black
// void" right after the crossing "turns and comes at the other tip"). This
// multiplies an extra fast cutoff on TOP of `1 - t^2`, left at 1 (no change
// to the already-tuned behavior) through the first 80% of the descent and
// only kicking in over the final stretch, forcing the residual offset all
// the way to ~0 by the time position has actually arrived instead of
// leaving it dangling at a still-significant fraction.
function descendOffsetTailCut(t) {
  return 1 - smoothstep((t - 0.8) / 0.2);
}

// Flyover: a closed camera path built from the same geometry the render
// pipeline uses - not an approximation. Starting at one arm's tip, each
// "hop" (a) flies that arm inward toward its hub ("to the star face"),
// (b) picks the next arm on that same face and flies back OUT to its tip
// ("back inside following the next arm"), (c) pulls up and out into a
// small orbit flourish around that tip's horn-triangle center, rotating
// 120 degrees (the three meeting tips' own natural spacing) before
// descending back down onto a neighboring star's tip ("turns right to
// continue to the tip of the adjacent star"), (d) once there, pulls up and
// out AGAIN into a much wider orbit flourish around that whole star
// (rotating ~4/5 of the way around while looking down at it) before
// settling back down to the exact hover height/tilt the arm segments use,
// then repeats from there. Preceded by a short establishing approach (far
// -> aligned with the first arm's outward tangent -> the tip itself) so
// the loop's first beat reads as "approaches, tilts parallel to a star
// arm, and zooms in."
//
// (c) used to fly directly along the rendered horn-arc bead, including its
// own mid-span dip underneath the neighboring star - geometrically
// faithful, but reported as disorienting ("the viewer gets lost"). Now it
// uses the same "pull out, orbit, come back down" shape (d) already uses
// for a whole star, just scaled to the horn-triangle's own three-tip
// span and rotated by a fixed 120 degrees - both flourishes share the same
// `lookAtCenterOffset`-style gaze bias (looking at the pivot point, not
// just tangent-forward) baked into `lookOffsets`.
//
// Arm segments hover just OUTSIDE the star's external surface along its
// TRUE local normal (`mapArmCenterlineWithNormal`), not the sphere-radial
// direction - measured up to ~27 degrees apart right where the exponential
// tip-bend curls the surface near a tip, which is exactly where a radial
// hover let the camera clip under the shell right after the approach.
// `normals`, a parallel array (the true local normal for arm points,
// sphere-radial as a fallback for the approach points, which have no local
// (u,w) frame of their own, and each flourish's own pivot-relative normal
// elsewhere), drives both the hover offset already baked into `points` and
// the camera's own banking at playback time. `speedMultipliers`, another
// parallel array, scales how fast `flyoverT` advances at each point:
// slower near an arm's tip (the thinnest part of the star) and through
// each flourish's own orbit, faster right as a flourish's descent "emerges"
// back onto a star's main surface.
function buildFlyoverPath(star2D, faces, tipsByLabel, connections, threeCycles, params) {
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
  // Shared "maneuvering, then emerging" speed pace both the horn-triangle
  // crossing flourish (c) and the star flourish (d) use: slow through their
  // own orbit, then ramping up toward the far end - that ramp up IS
  // "emerging back onto the main surface," so each flourish's landing is
  // already fast, and the NEXT flourish's own zoom-out continues easing off
  // that same pace rather than starting cold.
  const ARC_SLOW_SPEED = 0.4;
  const ARC_EMERGE_SPEED = 1.5;
  for (let hop = 0; hop < numHops; hop++) {
    const { faceIdx, armIdx } = parseLabel(currentLabel);
    const face = faces[faceIdx];

    // (a) fly this arm tip -> hub, hovering just outside its true
    // external surface ("to the star face").
    pushArm(mapArmCenterlineWithNormal(star2D, face, armIdx, params), false);

    // (b) pick the next arm on the same face, fly hub -> tip, same
    // external hover ("back inside following the next arm").
    const nextArmIdx = (armIdx + 1) % armCount;
    const nextArmFrames = mapArmCenterlineWithNormal(star2D, face, nextArmIdx, params);
    pushArm(nextArmFrames, true);

    const nextLabel = `F${faceIdx}-A${nextArmIdx}`;
    const nextTip = tipsByLabel.get(nextLabel);

    // Which neighboring star's tip this hop crosses to - alternating which
    // of the two options across hops for variety ("turns right to continue
    // to the tip of the adjacent star").
    const options = neighbors.get(nextLabel);
    const chosenLabel = options[hop % options.length];
    const chosenTip = tipsByLabel.get(chosenLabel);

    // Where this hop lands: computed here (not down in (d) where it used
    // to live) since both the new (c) crossing flourish AND the (d) star
    // flourish need it - (c) descends onto it, (d) starts its own zoom-out
    // FROM it, so the two flourishes hand off at exactly the same point/
    // normal the next hop's own step (a) will also start from, with no
    // seam anywhere in the chain.
    const { faceIdx: newFaceIdx, armIdx: newArmIdx } = parseLabel(chosenLabel);
    const orbitFace = faces[newFaceIdx];
    const chosenFrames = mapArmCenterlineWithNormal(star2D, orbitFace, newArmIdx, params);
    const targetPoint = chosenFrames[0].point.clone().addScaledVector(chosenFrames[0].normal, hoverFrac * R);
    const targetNormal = chosenFrames[0].normal;
    const tipAngle = Math.atan2(chosenTip.tipPosition.dot(orbitFace.W), chosenTip.tipPosition.dot(orbitFace.U));

    // (c) horn-triangle crossing flourish: pull up and out from the tip
    // just reached in (b), orbit 120 degrees (the three tips' own natural
    // spacing) around the horn-triangle's center - the centroid of all
    // three tips meeting at this dodecahedron vertex, not just the two
    // this hop actually touches - then descend back down onto the
    // neighboring star's tip. Replaces flying along the rendered horn-arc
    // bead's own underneath dip, which read as disorienting.
    const triple = threeCycles.find((t) => t.includes(nextLabel) && t.includes(chosenLabel));
    const thirdLabel = triple.find((l) => l !== nextLabel && l !== chosenLabel);
    const thirdTip = tipsByLabel.get(thirdLabel);
    const htCenter = hornTriangleCenter(nextTip, chosenTip, thirdTip);
    const htNormal = htCenter.clone().normalize();
    const htU = nextTip.tipPosition.clone().sub(htCenter);
    htU.addScaledVector(htNormal, -htU.dot(htNormal));
    if (htU.lengthSq() < 1e-10) htU.set(1, 0, 0);
    htU.normalize();
    const htW = new THREE.Vector3().crossVectors(htNormal, htU).normalize();
    // Sized off the three tips' own average distance from the center they
    // share, not off R_out (which is the whole FACE's scale - this pivot
    // is much smaller, just the gap between three neighboring tips).
    const htSpread = (nextTip.tipPosition.distanceTo(htCenter)
      + chosenTip.tipPosition.distanceTo(htCenter)
      + thirdTip.tipPosition.distanceTo(htCenter)) / 3;
    const htOrbitRadius = htSpread * 1.3;
    const htOrbitHeight = htSpread * 0.9;
    const htOrbitPoint = (angle, height) => htCenter.clone()
      .addScaledVector(htU, Math.cos(angle) * htOrbitRadius)
      .addScaledVector(htW, Math.sin(angle) * htOrbitRadius)
      .addScaledVector(htNormal, height);
    const htLookAtCenterOffset = (angle, height) => htCenter.clone().sub(htOrbitPoint(angle, height)).multiplyScalar(1.4);

    // `htU` points toward `nextTip` (angle 0 in this frame) by
    // construction; rotate the full 120 degrees toward whichever side
    // actually lands closer to `chosenTip`'s own angle, so the flourish
    // visibly progresses toward where it's headed rather than away from it.
    const HT_ROTATE = (Math.PI * 2) / 3;
    const toChosen = chosenTip.tipPosition.clone().sub(htCenter);
    const chosenAngle = Math.atan2(toChosen.dot(htW), toChosen.dot(htU));
    const normalizeAngle = (a) => {
      let x = a % (Math.PI * 2);
      if (x > Math.PI) x -= Math.PI * 2;
      if (x < -Math.PI) x += Math.PI * 2;
      return x;
    };
    const htDir = Math.abs(normalizeAngle(chosenAngle - HT_ROTATE)) <= Math.abs(normalizeAngle(chosenAngle + HT_ROTATE)) ? 1 : -1;
    const htEndAngle = htDir * HT_ROTATE;

    const lastArmPoint = nextArmFrames[0].point.clone().addScaledVector(nextArmFrames[0].normal, hoverFrac * R);
    const lastArmNormal = nextArmFrames[0].normal;

    // Zoom out from the tip (b) just landed on, easing from the arm's own
    // tip speed toward the flourish's slower "maneuvering" pace. The gaze
    // bias is applied at FULL strength immediately (not eased in with `t`
    // the way position/normal are) - right as the zoom begins, the camera
    // is still looking tangent-forward along the arm it just left, which
    // can be 80+ degrees off from the horn-triangle center; a fixed
    // world-space offset that size doesn't reliably win out over the
    // default lookahead until `t` has grown substantially, leaving several
    // early samples looking at empty space. Snapping to "look at the
    // pivot" immediately reads fine at flyover speed and is what actually
    // keeps every sample on-frame.
    const htZoomSamples = 14;
    for (let i = 1; i <= htZoomSamples; i++) {
      const t = smoothstep(i / htZoomSamples);
      const pos = lastArmPoint.clone().lerp(htOrbitPoint(0, htOrbitHeight), t);
      const normal = lastArmNormal.clone().lerp(htNormal, t).normalize();
      const speed = ARM_TIP_SPEED + (ARC_SLOW_SPEED - ARM_TIP_SPEED) * t;
      const offset = htLookAtCenterOffset(0, htOrbitHeight);
      pushPoint(pos, normal, offset, speed);
    }

    // Orbit the fixed 120 degrees at constant height, gaze locked onto the
    // horn-triangle's own center.
    const htCruiseSamples = 40;
    for (let i = 1; i <= htCruiseSamples; i++) {
      const angle = htEndAngle * (i / htCruiseSamples);
      const offset = htLookAtCenterOffset(angle, htOrbitHeight);
      pushPoint(htOrbitPoint(angle, htOrbitHeight), htNormal.clone(), offset, ARC_SLOW_SPEED);
    }

    // Descend back down onto the neighboring star's tip - the exact same
    // point/normal (d) below starts its own zoom-out from, and the next
    // hop's step (a) starts from too. Speed ramps up to ARC_EMERGE_SPEED,
    // "emerging" back onto the main surface - the pace (d)'s own zoom-out
    // continues easing off, exactly like the old arc's tail used to. The
    // gaze offset needs to reach exactly zero by the end (so the arrival
    // hands off cleanly to plain tangent-forward arm flight), but easing it
    // out LINEARLY left the same kind of under-corrected middle stretch the
    // zoom-out above had - `1 - t^2` holds the correction much closer to
    // full strength through most of the descent and only relaxes it in the
    // final stretch, right as position/normal are themselves converging on
    // the target anyway.
    // Bumped from 16 to 28 samples - denser waypoints for the Catmull-Rom
    // curve to interpolate between, smoothing what was reported as a
    // "tight, almost dizzying" final turn right after the horn-triangle
    // hover (the same stretch the black-void fix above targets).
    const htDescendSamples = 28;
    for (let i = 1; i <= htDescendSamples; i++) {
      const t = smoothstep(i / htDescendSamples);
      const pos = htOrbitPoint(htEndAngle, htOrbitHeight).lerp(targetPoint, t);
      const normal = htNormal.clone().lerp(targetNormal, t).normalize();
      const speed = ARC_SLOW_SPEED + (ARC_EMERGE_SPEED - ARC_SLOW_SPEED) * t;
      const offset = htLookAtCenterOffset(htEndAngle, htOrbitHeight).multiplyScalar((1 - t * t) * descendOffsetTailCut(t));
      pushPoint(pos, normal, offset, speed);
    }

    // (d) orbit flourish: having just arrived on `chosenLabel`'s star, pull
    // up and out again, sweep ~4/5 of the way around that whole face while
    // looking down at it from above, then spend the remaining ~1/5 of the
    // turn descending back down to the exact hover point/normal the next
    // hop's arm traversal starts from - so the loop stays perfectly
    // continuous into (a) above, next time through, with no seam.
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

    // Zoom out + tilt down: blend from (c)'s landing spot/normal (the tip
    // itself) up to the wide orbit position/attitude, easing the fast
    // "emerging" speed (c)'s own descent ended on back down to the default
    // cruising pace. The gaze offset is applied at full strength from the
    // start (not eased in with `t`) - right as this zoom begins, the
    // camera is still looking tangent-forward off the tip, up to ~90
    // degrees from the face center; measured directly (a black-frame
    // report traced to exactly this spot), an offset eased in linearly
    // doesn't reliably outweigh that default lookahead until well into the
    // zoom, leaving several early samples looking at empty space.
    const zoomSamples = 16;
    for (let i = 1; i <= zoomSamples; i++) {
      const t = smoothstep(i / zoomSamples);
      const pos = targetPoint.clone().lerp(orbitPoint(tipAngle, orbitHeight), t);
      const normal = targetNormal.clone().lerp(orbitFace.normal, t).normalize();
      const speed = ARC_EMERGE_SPEED + (1 - ARC_EMERGE_SPEED) * t;
      const offset = lookAtCenterOffset(tipAngle, orbitHeight);
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
    // gaze's "look at center" bias back to zero, so it hands off smoothly
    // to the next hop's plain forward-hugging look. Stops just short of an
    // exact position match so the next hop's first arm sample (which IS
    // that exact point) supplies the seam without a duplicate control
    // point. `1 - t^2` (not linear) holds the gaze correction close to full
    // strength through most of the descent, only relaxing it in the final
    // stretch - the same under-correction the zoom-out above had, mirrored.
    const descendSamples = 24;
    const descendSpan = Math.PI * 2 - cruiseSpan;
    const cruiseEndAngle = tipAngle + cruiseSpan;
    const descendDenom = descendSamples + 1;
    for (let i = 1; i <= descendSamples; i++) {
      const t = smoothstep(i / descendDenom);
      const angle = cruiseEndAngle + descendSpan * (i / descendDenom);
      const pos = orbitPoint(angle, orbitHeight).lerp(targetPoint, t);
      const normal = orbitFace.normal.clone().lerp(targetNormal, t).normalize();
      const offset = lookAtCenterOffset(angle, orbitHeight).multiplyScalar((1 - t * t) * descendOffsetTailCut(t));
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
    const isShown = !params.singleFaceMode || face.index === params.singleFaceIndex;
    if (isShown) {
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

      for (const arm of arms) tipsByLabel.set(`F${face.index}-A${arm.armIndex}`, arm);
    } else {
      // Single-face mode: this face's own mesh/rim aren't rendered, but its
      // tip positions/tangents are still needed - other faces' snap-hub
      // pieces (or, outside single-face mode, the horn-arc/spiral
      // connectors) reference tips across face boundaries. `computeArmTips`
      // gets just that, skipping the full top/bottom-sheet + wall vertex
      // build this face doesn't need.
      for (const arm of computeArmTips(star2D, face, params)) {
        tipsByLabel.set(`F${face.index}-A${arm.armIndex}`, arm);
      }
    }
  }

  const R = faces[0].R_out;
  let missing = 0;
  let connectorCount = 0;

  // `showExtensions` ("Show horn arcs" in the panel) gates ALL THREE
  // connector styles, not just the original horn arc - it used to only be
  // checked inside the hornArc branch, so the checkbox silently did
  // nothing in the other two presets (their own branches never looked at
  // it at all).
  if (params.showExtensions) {
    if (params.connectorStyle === 'hornArc') {
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
        connectorCount++;
      }
    } else if (params.connectorStyle === 'snapHub') {
      // 3D-printing preset: only the vertices touching the isolated face
      // get a hub piece built - the other faces around those vertices
      // aren't rendered anyway, so there's nothing to illustrate for the
      // rest.
      const facePrefix = `F${params.singleFaceIndex}-`;
      for (const triple of threeCycles) {
        if (!triple.some((label) => label.startsWith(facePrefix))) continue;
        const tips = triple.map((label) => tipsByLabel.get(label));
        if (tips.some((t) => !t)) { missing++; continue; }
        // Only draw a peg toward a tip that's actually on the visible face -
        // the other 1-2 tips of this triple belong to faces that aren't
        // rendered in single-face mode, so a peg aimed at them is a thin
        // stick shooting off into empty space with no visible socket to
        // reach, which is what made the whole assembly read as "way too
        // large/long" even though each peg's own length is correctly under
        // the triangle's side length.
        const pegMask = triple.map((label) => label.startsWith(facePrefix));
        const hubGroup = buildSnapHubGroup(tips[0], tips[1], tips[2], { R, ...params, pegMask });
        hubGroup.children.forEach((m) => { m.material = rimMaterial; });
        extGroup.add(hubGroup);
        connectorCount++;
      }
    } else if (params.connectorStyle === 'spiralVortex') {
      // Star Odyssey: every vertex gets a 3-way spiral instead of the
      // three horn-arc pairs that would otherwise connect it.
      for (const triple of threeCycles) {
        const tips = triple.map((label) => tipsByLabel.get(label));
        if (tips.some((t) => !t)) { missing++; continue; }
        const vortexGroup = buildSpiralVortexGroup(tips[0], tips[1], tips[2], { R, ...params });
        vortexGroup.children.forEach((m) => { m.material = rimMaterial; });
        extGroup.add(vortexGroup);
        connectorCount++;
      }
    } else if (params.connectorStyle === 'spiralRibbon') {
      // Star Odyssey - Thick Bands: same 3-way spiral, extruded as a flat
      // ribbon (with an optional Mobius-style half-twist) instead of a
      // tapering tube.
      for (const triple of threeCycles) {
        const tips = triple.map((label) => tipsByLabel.get(label));
        if (tips.some((t) => !t)) { missing++; continue; }
        const ribbonGroup = buildSpiralVortexRibbonGroup(tips[0], tips[1], tips[2], { R, ...params });
        ribbonGroup.children.forEach((m) => { m.material = rimMaterial; });
        extGroup.add(ribbonGroup);
        connectorCount++;
      }
    }
  }

  scene.add(starGroup);
  scene.add(extGroup);
  scene.add(rimGroup);
  applyHiddenFaces();

  document.getElementById('metrics').innerHTML =
    `Faces: ${faces.length} | Tips: ${tipsByLabel.size}/60<br>` +
    `Connectors (${params.connectorStyle}): ${connectorCount}${missing ? ` (${missing} missing!)` : ''}`;

  const listEl = document.getElementById('conn-list');
  if (listEl) {
    listEl.textContent = connections.map(({ a, b }) => `${a} -> ${b}`).join('\n');
  }

  // The flyover path assumes the full 12-face assembled sculpture with
  // every tip/horn-arc present - meaningless (and error-prone) in
  // single-face mode, where most of that geometry is deliberately absent.
  if (!params.singleFaceMode) {
    ({ curve: flyoverCurve, lookOffsets: flyoverLookOffsets, normals: flyoverNormals, speedMultipliers: flyoverSpeedMultipliers } = buildFlyoverPath(star2D, faces, tipsByLabel, connections, threeCycles, params));
  } else {
    flyoverCurve = null;
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
bindSlider('extLengthFactor', 'extLengthFactor');
bindSlider('extDepthFraction', 'extDepthFraction');
bindSlider('extArcWidthFrac', 'extArcWidthFrac');
bindSlider('extClothoid', 'extClothoid');
bindSlider('spiralSweepFrac', 'spiralSweepFrac');
bindSlider('spiralLaunchFrac', 'spiralLaunchFrac');
bindSlider('spiralArcWidthFrac', 'spiralArcWidthFrac');
bindSlider('spiralRibbonWidthFrac', 'spiralRibbonWidthFrac');
bindSlider('spiralRibbonThicknessFrac', 'spiralRibbonThicknessFrac');
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

const PRESET_HINTS = {
  stardream1: 'Original assembled sculpture, 20 tip-to-tip horn-triangle arcs.',
  print3d: 'One detailed face at a time, sized for a real print - peg + socket friction-fit joints (small hub piece per vertex) instead of the fused horn arc. Pick which face with the slider below.',
  starOdyssey: "Same stars as #1, but every horn-triangle arc is replaced by a 3-way spiral funnel converging at that vertex's center.",
  odysseyThicker: 'Star Odyssey with wider, chunkier tips and a smaller hub - a second live-tuned variant.',
  odysseyThickBands: 'Star Odyssey with the spiral connectors as flat, wide ribbons instead of tapered tubes, with a half-twist along each band as it leaves the arm and spirals in to meet the other two.',
};
// Each connector style has its own shape sliders (the horn arc's
// length/depth/clothoid params mean nothing to the spiral vortex, and vice
// versa) - shown/hidden together so a preset never leaves a slider on
// screen that silently does nothing, which is exactly what happened before
// this: Star Odyssey used the horn-arc panel's sliders (and its own
// "Show connectors" checkbox check) despite reading none of those params.
function updateConnectorControlsVisibility() {
  const isSpiral = params.connectorStyle === 'spiralVortex' || params.connectorStyle === 'spiralRibbon';
  document.getElementById('hornArcControls').style.display = params.connectorStyle === 'hornArc' ? 'block' : 'none';
  // Turns/sweep shape the same underlying curve for both spiral styles;
  // width is style-specific (tube radius vs. ribbon width+thickness+twist).
  document.getElementById('spiralCurveControls').style.display = isSpiral ? 'block' : 'none';
  document.getElementById('spiralVortexTubeControls').style.display = params.connectorStyle === 'spiralVortex' ? 'block' : 'none';
  document.getElementById('spiralRibbonControls').style.display = params.connectorStyle === 'spiralRibbon' ? 'block' : 'none';
}
document.getElementById('preset').addEventListener('change', (e) => {
  const name = e.target.value;
  window.__spiralDodeca.applyPreset(name);
  document.getElementById('preset-hint').textContent = PRESET_HINTS[name] || '';
  document.getElementById('singleFaceRow').style.display = params.singleFaceMode ? 'block' : 'none';
  updateConnectorControlsVisibility();
});
document.getElementById('singleFaceIndex').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  params.singleFaceIndex = v;
  document.getElementById('v-singleFaceIndex').textContent = v;
  rebuild();
  applyHiddenFaces();
  if (params.singleFaceMode) focusOnFace(v);
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
updateConnectorControlsVisibility();

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
// Single-face mode ("Stardream - 3D Printing"): point the default
// (non-flyover) camera at the one face being shown instead of leaving it
// wherever OrbitControls last had it aimed at the full assembled sculpture
// - otherwise turning the preset on can easily land the isolated face
// mostly or entirely out of frame. Framed from outside along the face's
// own normal, at a distance scaled to the face's own R_out rather than a
// fixed number, so it frames sensibly regardless of tipScale/bandHalfWidth.
function focusOnFace(faceIndex) {
  const face = faces[faceIndex];
  const dist = face.R_out * 3.2;
  camera.position.copy(face.center).addScaledVector(face.normal, dist).addScaledVector(face.U, dist * 0.35);
  camera.up.copy(face.normal);
  controls.target.copy(face.center);
  controls.update();
}
function resetDefaultView() {
  camera.position.copy(DEFAULT_CAMERA_POS);
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}
function setFlyoverMode(on) {
  params.flyoverMode = on;
  controls.enabled = !on;
  if (on) {
    flyoverT = 0;
    flyoverLastMs = null; // no dt on the first frame after (re)enabling
    flyoverSpeedBeforePause = null;
  } else {
    resetDefaultView();
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
      params.flyoverSpeed = flyoverSpeedBeforePause || 0.03;
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
    // Entering single-face mode while the flyover (which assumes the full
    // assembled sculpture) is running would leave the camera flying
    // through geometry that's no longer there - turn it off first, same
    // as if the user had unchecked it themselves.
    if (partial.singleFaceMode && params.flyoverMode) setFlyoverMode(false);
    Object.assign(params, partial);
    for (const key of Object.keys(partial)) syncControl(key);
    applyMaterialPreset(params.material);
    applyPattern();
    applyLampMode(params.lampMode);
    applyClipping();
    rebuild();
    if (partial.flyoverMode !== undefined) setFlyoverMode(partial.flyoverMode);
    if (partial.singleFaceMode !== undefined) {
      if (partial.singleFaceMode) focusOnFace(params.singleFaceIndex);
      else resetDefaultView();
    }
  },
  applyPreset(name) {
    const bundle = PRESETS[name];
    if (!bundle) return;
    this.setParams({ ...bundle, preset: name });
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
