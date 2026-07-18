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
    entryA = null,
    entryB = null,
  } = options;

  const pA = tipA.position;
  const pB = tipB.position;
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

  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices = new Uint32Array(segments * 6);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];

    const twistAngle = angleStart + (twistTurns * Math.PI * 2 + delta) * t;
    const ribbonDir = normal.clone().multiplyScalar(Math.cos(twistAngle))
      .addScaledVector(binormal, Math.sin(twistAngle));

    // Blend the cross-section from the tube's cut-edge width at each end up
    // to the full ribbon width in the middle.
    const width = THREE.MathUtils.lerp(
      tubeRadius,
      halfWidth,
      smoothstep(0, 0.3, t) * smoothstep(1, 0.7, t)
    );

    const edgeA = points[i].clone().addScaledVector(ribbonDir, width);
    const edgeB = points[i].clone().addScaledVector(ribbonDir, -width);

    positions[i * 6 + 0] = edgeA.x;
    positions[i * 6 + 1] = edgeA.y;
    positions[i * 6 + 2] = edgeA.z;
    positions[i * 6 + 3] = edgeB.x;
    positions[i * 6 + 4] = edgeB.y;
    positions[i * 6 + 5] = edgeB.z;

    const uvU = t * uRepeat;
    uvs[i * 4 + 0] = uvU;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = uvU;
    uvs[i * 4 + 3] = 1;

    if (i < segments) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      const base = i * 6;
      indices[base + 0] = a;
      indices[base + 1] = c;
      indices[base + 2] = b;
      indices[base + 3] = b;
      indices[base + 4] = c;
      indices[base + 5] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return { geometry, curve };
}
