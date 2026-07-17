// Builds a twisted, ribbon-like connector mesh between two star-arm tips.
//
// The curve is a cubic Bezier that leaves each tip along that tip's own
// outward direction just long enough to read as a continuation of the star
// arm, then dives inward toward the sphere's center so the bulk of the
// ribbon passes *under* the surrounding stars, at a lower radius than the
// surface geometry - a woven, over-under look rather than tendrils arcing
// above the body.

import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, label: string}} tipA
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, label: string}} tipB
 * @param {object} [options]
 * @param {number} [options.segments=48]
 * @param {number} [options.halfWidth=0.09] ribbon half-width at its widest
 * @param {number} [options.twistTurns=0.5] number of full twists along the ribbon (kept low so the strip doesn't fight itself visually)
 * @param {number} [options.leavePull=0.18] how far the curve initially follows each tip's own outward direction, as a fraction of tip-to-tip distance
 * @param {number} [options.dipPull=0.85] how far the control points are then pulled inward toward the sphere center, as a fraction of tip-to-tip distance
 * @param {number} [options.minDip=0.3] floor on the inward pull (world units), so short hops still duck visibly under the surface
 * @returns {{geometry: THREE.BufferGeometry, curve: THREE.CubicBezierCurve3}}
 */
export function buildRibbon(tipA, tipB, options = {}) {
  const {
    segments = 48,
    halfWidth = 0.09,
    twistTurns = 0.5,
    leavePull = 0.18,
    dipPull = 0.85,
    minDip = 0.3,
  } = options;

  const pA = tipA.position;
  const pB = tipB.position;
  const span = pA.distanceTo(pB);
  const leaveLen = span * leavePull;
  const dipLen = Math.max(span * dipPull, minDip);

  const radialA = pA.clone().normalize();
  const radialB = pB.clone().normalize();

  const c1 = pA.clone().addScaledVector(tipA.outDir, leaveLen).addScaledVector(radialA, -dipLen);
  const c2 = pB.clone().addScaledVector(tipB.outDir, leaveLen).addScaledVector(radialB, -dipLen);

  const curve = new THREE.CubicBezierCurve3(pA, c1, c2, pB);
  const frames = curve.computeFrenetFrames(segments, false);
  const points = curve.getSpacedPoints(segments);

  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices = new Uint32Array(segments * 6);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const tangent = frames.tangents[i];
    const normal = frames.normals[i];

    const twistAngle = twistTurns * Math.PI * 2 * t;
    const ribbonDir = normal.clone().applyAxisAngle(tangent, twistAngle);

    // Taper the ends down so the ribbon reads as growing out of the star
    // tip rather than being capped flat.
    const width = halfWidth * smoothstep(0, 0.12, t) * smoothstep(1, 0.88, t) || halfWidth * 0.001;

    const edgeA = points[i].clone().addScaledVector(ribbonDir, width);
    const edgeB = points[i].clone().addScaledVector(ribbonDir, -width);

    positions[i * 6 + 0] = edgeA.x;
    positions[i * 6 + 1] = edgeA.y;
    positions[i * 6 + 2] = edgeA.z;
    positions[i * 6 + 3] = edgeB.x;
    positions[i * 6 + 4] = edgeB.y;
    positions[i * 6 + 5] = edgeB.z;

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
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return { geometry, curve };
}
