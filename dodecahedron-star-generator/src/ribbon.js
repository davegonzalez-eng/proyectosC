// Builds a twisted, ribbon-like connector mesh between two star-arm tips.
//
// The curve is a 5-point Catmull-Rom spline: tip -> short "leave" point
// along that tip's own *tangent* (its arm's actual trend as it reaches the
// tip - already curving thanks to swirl/wave/bulge/arm-twist, generally
// dipping toward a lower radius rather than heading straight out) -> a dip
// point pulled inward toward the sphere's center to a precise target
// radius -> a matching "leave" point on the other side -> the other tip.
// Because Catmull-Rom passes exactly through every one of those points
// (unlike Bezier control points, which only pull the curve without
// touching it), the dip depth is exact rather than approximate, and the
// ribbon continues the arm's own existing slope instead of resetting to a
// purely radial direction and only then diving inward.

import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, tangent: THREE.Vector3, label: string}} tipA
 * @param {{position: THREE.Vector3, outDir: THREE.Vector3, tangent: THREE.Vector3, label: string}} tipB
 * @param {object} [options]
 * @param {number} [options.segments=48]
 * @param {number} [options.halfWidth=0.09] ribbon half-width at its widest (middle)
 * @param {number} [options.tubeRadius=0.04] cross-section size to blend into at each end, matching the star tube's own radius so there's no visible jump at the join
 * @param {number} [options.twistTurns=0.5] number of full twists along the ribbon (kept low so the strip doesn't fight itself visually)
 * @param {number} [options.leaveFraction=0.22] how far (as a fraction of tip-to-tip distance) the curve travels along each tip's own tangent before the dip - controls how "smoothly" it blends with the arm
 * @param {number} [options.depthFraction=0.9] target radius at the dip point, as a fraction of the endpoints' average distance from the sphere center (e.g. 0.9 = dips only 10% of the way toward the center)
 * @param {number} [options.textureWorldSize=0.12] world-space size of one texture tile along the ribbon's length, for UV tiling density (matched against the hex-grid cell size so the two read as the same texture)
 * @returns {{geometry: THREE.BufferGeometry, curve: THREE.CatmullRomCurve3}}
 */
export function buildRibbon(tipA, tipB, options = {}) {
  const {
    segments = 48,
    halfWidth = 0.09,
    tubeRadius = 0.04,
    twistTurns = 0.5,
    leaveFraction = 0.22,
    depthFraction = 0.9,
    textureWorldSize = 0.12,
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

  const curve = new THREE.CatmullRomCurve3([pA, leaveA, dipMid, leaveB, pB], false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(segments, false);
  const points = curve.getSpacedPoints(segments);
  const uRepeat = Math.max(curve.getLength() / textureWorldSize, 1);

  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices = new Uint32Array(segments * 6);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const tangent = frames.tangents[i];
    const normal = frames.normals[i];

    const twistAngle = twistTurns * Math.PI * 2 * t;
    const ribbonDir = normal.clone().applyAxisAngle(tangent, twistAngle);

    // Blend the cross-section from the tube's own radius at each end up to
    // the full ribbon width in the middle, so the surface size matches the
    // star tube's at the join instead of jumping from a point or a slab.
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
