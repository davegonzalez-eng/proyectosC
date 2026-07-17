// Builds a star's outline as a tube with a *variable* cross-section instead
// of THREE.TubeGeometry's constant circle: round through the middle of each
// arm/inner-point stretch, tapering to a flat, ribbon-width sliver right at
// each tip. Every arm connects to a ribbon (§9 of the README), and the
// ribbon's own cross-section starts at exactly `tubeRadius` wide - so
// without this, the round tube meets the flat ribbon with a visible
// mismatch (a "cap" bump) right at the join. Flattening the tube itself
// removes that seam: the arm preserves its width and slope on the way into
// the ribbon instead of ending in a rounded cap that the ribbon then starts
// over from.

import * as THREE from 'three';

// Tip control points sit at these parameters on the closed 10-point curve
// (5 tips + 5 inner points, evenly spaced): tip i is at i / 5.
const TIP_PARAMS = [0, 0.2, 0.4, 0.6, 0.8];
// How far (in curve parameter, 0-1) the taper reaches out from each tip.
// 0.05 is half the 0.1 gap to the neighboring inner point, so the taper
// stays local to each arm's own final stretch.
const TAPER_PARAM = 0.05;
// The cross-section's minor axis never fully collapses to zero (which would
// produce degenerate normals right at the tip) - it shrinks to this
// fraction of tubeRadius instead, reading as flat without being degenerate.
const FLAT_MINOR_FRACTION = 0.12;

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function tipFlatness(t) {
  let minDt = Infinity;
  for (const tip of TIP_PARAMS) {
    const raw = Math.abs(t - tip);
    minDt = Math.min(minDt, raw, 1 - raw);
  }
  return 1 - smoothstep(0, TAPER_PARAM, minDt);
}

/**
 * @param {{outline: THREE.Vector3[]}} star
 * @param {number} tubeRadius
 * @param {object} [options]
 * @param {number} [options.tubularSegments=200]
 * @param {number} [options.radialSegments=8]
 * @returns {THREE.BufferGeometry}
 */
export function buildStarTube(star, tubeRadius, options = {}) {
  const { tubularSegments = 200, radialSegments = 8 } = options;
  const N = tubularSegments;

  const curve = new THREE.CatmullRomCurve3(star.outline, true, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(N, true);
  const points = curve.getSpacedPoints(N);

  const positions = new Float32Array(N * radialSegments * 3);
  const ringStart = new Array(N);

  for (let i = 0; i < N; i++) {
    const t = i / N;
    const minorScale = THREE.MathUtils.lerp(1, FLAT_MINOR_FRACTION, tipFlatness(t));
    const center = points[i];
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];

    ringStart[i] = i * radialSegments;
    for (let j = 0; j < radialSegments; j++) {
      const angle = (2 * Math.PI * j) / radialSegments;
      const x = Math.cos(angle) * tubeRadius;
      const y = Math.sin(angle) * tubeRadius * minorScale;
      const base = (ringStart[i] + j) * 3;
      positions[base + 0] = center.x + normal.x * x + binormal.x * y;
      positions[base + 1] = center.y + normal.y * x + binormal.y * y;
      positions[base + 2] = center.z + normal.z * x + binormal.z * y;
    }
  }

  const indices = [];
  for (let i = 0; i < N; i++) {
    const iNext = (i + 1) % N;
    const a0 = ringStart[i];
    const a1 = ringStart[iNext];
    for (let j = 0; j < radialSegments; j++) {
      const jNext = (j + 1) % radialSegments;
      const v00 = a0 + j, v01 = a0 + jNext, v10 = a1 + j, v11 = a1 + jNext;
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
