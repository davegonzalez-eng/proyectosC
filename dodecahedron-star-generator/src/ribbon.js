// Builds a twisted, ribbon-like connector mesh between two star-arm tips.
//
// The curve is a Catmull-Rom spline threaded through, in order: the tube's
// cut-edge point on arm A (where the star's own tube deliberately stops
// short of the tip, see startube.js) -> arm A's tip -> a short "leave"
// point along the tip's own tangent -> a dip point pulled inward toward
// the sphere's center to a precise target radius -> the mirror of those on
// arm B. Because the spline passes through the exact cut position, the
// ribbon physically REPLACES the removed last stretch of the arm rather
// than starting where a finished tube ends - the arm becomes the ribbon.
//
// Ribbon orientation is pinned at both ends: the flat (width) direction is
// steered to cross(pathTangent, sphereRadial) - the same surface-tangent
// direction the tube flattens its cut ends against - by solving for the
// twist-angle correction that lands the Frenet frame on that direction at
// t=0 and t=1, with the user's twistTurns and the correction interpolated
// in between.

import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, tangent: THREE.Vector3, label: string}} tipA
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, tangent: THREE.Vector3, label: string}} tipB
 * @param {object} [options]
 * @param {number} [options.segments=64]
 * @param {number} [options.halfWidth=0.09] ribbon half-width at its widest (middle)
 * @param {number} [options.tubeRadius=0.04] half-width at each end, matching the tube's flattened cut edge so the takeover is seamless
 * @param {number} [options.twistTurns=0.5] number of full twists along the ribbon
 * @param {number} [options.leaveFraction=0.22] how far (as a fraction of tip-to-tip distance) the curve travels along each tip's own tangent before the dip
 * @param {number} [options.depthFraction=0.9] target radius at the dip point, as a fraction of the endpoints' average distance from the sphere center
 * @param {number} [options.textureWorldSize=0.12] world-space size of one texture tile along the ribbon's length
 * @param {number} [options.thickness=0.012] slab thickness (world units) through the ribbon's middle
 * @param {number} [options.endThickness=0.0072] slab thickness right at each end, matching the tube's flattened cut-edge thickness (2 x its minor axis)
 * @param {number} [options.junctionSink=0] radial pull (world units, toward the sphere center) applied to the tip endpoints, matching the tube's sunk cut edges
 * @param {THREE.Vector3|null} [options.entryA=null] tube cut-edge point on arm A the spline should start from (falls back to starting at the tip)
 * @param {THREE.Vector3|null} [options.entryB=null] tube cut-edge point on arm B the spline should end at
 * @returns {{geometry: THREE.BufferGeometry, curve: THREE.CatmullRomCurve3}}
 */
export function buildRibbon(tipA, tipB, options = {}) {
  const {
    segments = 64,
    halfWidth = 0.09,
    tubeRadius = 0.04,
    twistTurns = 0.5,
    leaveFraction = 0.22,
    depthFraction = 0.9,
    textureWorldSize = 0.12,
    thickness = 0.012,
    endThickness = 0.0072,
    junctionSink = 0,
    entryA = null,
    entryB = null,
  } = options;

  // Sink the tip points radially by the same amount the tube's cut edges
  // (and the entry points passed in, which come pre-sunk from
  // buildStarTube) are sunk, so the whole junction moves inward together.
  const sink = (p) =>
    junctionSink ? p.clone().addScaledVector(p.clone().normalize(), -junctionSink) : p;
  const pA = sink(tipA.position);
  const pB = sink(tipB.position);
  const span = pA.distanceTo(pB);
  const leaveLen = Math.max(span * leaveFraction, 0.02);

  const leaveA = pA.clone().addScaledVector(tipA.tangent || tipA.outDir, leaveLen);
  const leaveB = pB.clone().addScaledVector(tipB.tangent || tipB.outDir, leaveLen);

  const avgRadius = (pA.length() + pB.length()) / 2;
  const targetRadius = avgRadius * depthFraction;
  const midPoint = leaveA.clone().add(leaveB).multiplyScalar(0.5);
  const dipMid = midPoint.length() > 1e-6
    ? midPoint.clone().setLength(Math.min(targetRadius, midPoint.length()))
    : midPoint;

  const splinePoints = [];
  if (entryA) splinePoints.push(entryA);
  splinePoints.push(pA, leaveA, dipMid, leaveB, pB);
  if (entryB) splinePoints.push(entryB);

  const curve = new THREE.CatmullRomCurve3(splinePoints, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(segments, false);
  const points = curve.getSpacedPoints(segments);
  const uRepeat = Math.max(curve.getLength() / textureWorldSize, 1);

  // Angle (in the local normal/binormal plane) that points the flat side
  // along the surface-tangent direction perpendicular to the path - the
  // orientation the tube's flattened cut edges use.
  const alignAngle = (i) => {
    const desired = new THREE.Vector3().crossVectors(frames.tangents[i], points[i].clone().normalize());
    if (desired.lengthSq() < 1e-10) return 0;
    desired.normalize();
    return Math.atan2(desired.dot(frames.binormals[i]), desired.dot(frames.normals[i]));
  };
  const angleStart = alignAngle(0);
  const angleEnd = alignAngle(segments);
  // Correction on top of the base twist so the flat side also lands on the
  // surface-tangent direction at t=1 (mod pi - a ribbon's flat is two-sided).
  let delta = angleEnd - (angleStart + twistTurns * Math.PI * 2);
  delta = ((delta % Math.PI) + Math.PI * 1.5) % Math.PI - Math.PI / 2;

  // Precompute per-station data, then extrude the strip into a slab with
  // real thickness: a top face, a bottom face, and two side walls (each
  // built as its own vertex strip so the 90-degree edges stay crisp). The
  // thickness tapers at both ends down to `endThickness` - the tube's own
  // flattened cut-edge thickness - so the slab butts against the tube cut
  // with matching width AND matching thickness.
  const stations = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];

    const twistAngle = angleStart + (twistTurns * Math.PI * 2 + delta) * t;
    const ribbonDir = normal.clone().multiplyScalar(Math.cos(twistAngle))
      .addScaledVector(binormal, Math.sin(twistAngle));
    const upDir = new THREE.Vector3().crossVectors(frames.tangents[i], ribbonDir).normalize();

    // Blend the cross-section from the tube's cut-edge dimensions at each
    // end up to the full ribbon width/thickness in the middle.
    const blend = smoothstep(0, 0.3, t) * smoothstep(1, 0.7, t);
    const width = THREE.MathUtils.lerp(tubeRadius, halfWidth, blend);
    const halfT = THREE.MathUtils.lerp(endThickness, thickness, blend) / 2;

    // Both UV axes are mapped in *world units* at the same scale: one tile
    // spans textureWorldSize along the length, and (the hex tile being
    // sqrt(3) taller than wide) sqrt(3) x textureWorldSize across the
    // width - measured from the actual local half-width, so the hexes stay
    // the same physical size everywhere instead of stretching to fit the
    // ribbon's varying width. RepeatWrapping handles the fractional span.
    const uvU = t * uRepeat;
    const uvVHalf = width / (textureWorldSize * Math.sqrt(3));

    const center = points[i];
    const wOff = ribbonDir.clone().multiplyScalar(width);
    const tOff = upDir.multiplyScalar(halfT);
    stations.push({
      topA: center.clone().add(wOff).add(tOff),
      topB: center.clone().sub(wOff).add(tOff),
      botA: center.clone().add(wOff).sub(tOff),
      botB: center.clone().sub(wOff).sub(tOff),
      uvU,
      uvVHalf,
    });
  }

  const positions = [];
  const uvs = [];
  const indices = [];

  // Each strip: 2 verts per station, quads between consecutive stations.
  const addStrip = (vertPair, uvPair) => {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const s = stations[i];
      const [va, vb] = vertPair(s);
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      const [uva, uvb] = uvPair(s);
      uvs.push(uva[0], uva[1], uvb[0], uvb[1]);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      const b = a + 1;
      const c = base + (i + 1) * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  };

  const sideBandV = (s) => Math.max(s.uvVHalf * 0.1, 0.01);
  addStrip((s) => [s.topA, s.topB], (s) => [[s.uvU, 0.5 + s.uvVHalf], [s.uvU, 0.5 - s.uvVHalf]]);
  addStrip((s) => [s.botB, s.botA], (s) => [[s.uvU, 0.5 - s.uvVHalf], [s.uvU, 0.5 + s.uvVHalf]]);
  addStrip((s) => [s.topA, s.botA], (s) => [[s.uvU, 0.5], [s.uvU, 0.5 + sideBandV(s)]]);
  addStrip((s) => [s.botB, s.topB], (s) => [[s.uvU, 0.5], [s.uvU, 0.5 + sideBandV(s)]]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { geometry, curve };
}
