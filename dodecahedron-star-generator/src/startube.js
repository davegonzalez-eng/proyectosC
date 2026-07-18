// Builds a star's outline as a tube that deliberately STOPS SHORT of each
// tip: the tube is cut in a parameter window around all 5 tip points,
// leaving 5 open segments (inner-point stretches), each tapering from a
// round cross-section in its middle to a flat, ribbon-width sliver right at
// its cut ends. The removed stretch - cut point, through the tip, to the
// other cut point - is not rendered by the tube at all: the two ribbons
// that touch this arm (every arm is touched by exactly two, see the
// adjacency rule in geometry.js) each take over one half of it, their
// splines threaded through the exact cut positions returned in `cuts`. So
// the arm's end IS the ribbon, not a tube with a ribbon glued on.
//
// Cross-section orientation: the major (width) axis is the surface-tangent
// direction perpendicular to the path - cross(pathTangent, sphereRadial) -
// the same direction the ribbon aligns its own flat side to at its ends, so
// tube and ribbon are flattened in the same plane where they meet.

import * as THREE from 'three';

// Tip control points sit at these arc-length parameters on the closed
// 10-point outline curve (5 tips + 5 inner points; the pentagram's 10 edges
// are congruent by symmetry, so equal arc spacing).
const TIP_PARAMS = [0, 0.2, 0.4, 0.6, 0.8];
// The cross-section's minor axis never fully collapses to zero (degenerate
// normals) - it shrinks to this fraction of tubeRadius, reading as flat.
const FLAT_MINOR_FRACTION = 0.12;

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {{outline: THREE.Vector3[]}} star
 * @param {number} tubeRadius
 * @param {object} [options]
 * @param {number} [options.tubularSegments=200] ring density for the whole (uncut) perimeter
 * @param {number} [options.radialSegments=8]
 * @param {number} [options.cutWindow=0.04] half-size (in arc-length parameter, 0-1) of the removed window centered on each tip
 * @param {number} [options.taper=0.035] parameter distance over which each segment flattens toward its cut ends
 * @param {number} [options.junctionSink=0] radial pull (world units, toward the sphere center) applied at the cut edges, fading out over sinkSpan into each segment
 * @param {number} [options.sinkSpan=0.05] parameter distance over which the junction sink fades to zero
 * @returns {{geometry: THREE.BufferGeometry, cuts: Array<{asc: THREE.Vector3, desc: THREE.Vector3}>}}
 *   cuts[k] holds the two cut-edge centers for tip/arm k: `asc` on the side
 *   approached from the previous inner point, `desc` on the side toward the
 *   next inner point.
 */
export function buildStarTube(star, tubeRadius, options = {}) {
  const {
    tubularSegments = 200,
    radialSegments = 8,
    cutWindow = 0.04,
    taper = 0.035,
    junctionSink = 0,
    sinkSpan = 0.05,
  } = options;

  const curve = new THREE.CatmullRomCurve3(star.outline, true, 'catmullrom', 0.5);

  // Radial pull toward the sphere's center, full strength at a segment's
  // cut edges and fading to zero `sinkSpan` (curve parameter) into the
  // segment - so the arm/ribbon junction as a whole can be sunk to a lower
  // radius without moving the rest of the star. The ribbon endpoints and
  // the returned cut points get the identical full-strength sink, keeping
  // the fusion watertight at any slider value.
  const sinkAt = (distToEnd) =>
    junctionSink ? junctionSink * (1 - smoothstep(0, sinkSpan, distToEnd)) : 0;
  const applySink = (p, amount) =>
    amount ? p.addScaledVector(p.clone().normalize(), -amount) : p;

  const positions = [];
  const indices = [];
  let ringBase = 0;

  for (let k = 0; k < TIP_PARAMS.length; k++) {
    const u0 = TIP_PARAMS[k] + cutWindow;
    const u1 = (k === TIP_PARAMS.length - 1 ? 1 : TIP_PARAMS[k + 1]) - cutWindow;
    const span = u1 - u0;
    const rings = Math.max(Math.ceil(span * tubularSegments), 8);

    for (let i = 0; i <= rings; i++) {
      const u = u0 + (span * i) / rings;
      const distToEnd = Math.min(u - u0, u1 - u);
      const minorScale = THREE.MathUtils.lerp(FLAT_MINOR_FRACTION, 1, smoothstep(0, taper, distToEnd));

      const p = applySink(curve.getPointAt(u), sinkAt(distToEnd));
      const tangent = curve.getTangentAt(u);
      const radial = p.clone().normalize();
      const major = new THREE.Vector3().crossVectors(tangent, radial);
      if (major.lengthSq() < 1e-10) major.set(1, 0, 0); // path never runs radially in practice
      major.normalize();
      const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();

      for (let j = 0; j < radialSegments; j++) {
        const angle = (2 * Math.PI * j) / radialSegments;
        const x = Math.cos(angle) * tubeRadius;
        const y = Math.sin(angle) * tubeRadius * minorScale;
        positions.push(
          p.x + major.x * x + minor.x * y,
          p.y + major.y * x + minor.y * y,
          p.z + major.z * x + minor.z * y
        );
      }
    }

    for (let i = 0; i < rings; i++) {
      const a0 = ringBase + i * radialSegments;
      const a1 = ringBase + (i + 1) * radialSegments;
      for (let j = 0; j < radialSegments; j++) {
        const jNext = (j + 1) % radialSegments;
        const v00 = a0 + j, v01 = a0 + jNext, v10 = a1 + j, v11 = a1 + jNext;
        indices.push(v00, v10, v01, v01, v10, v11);
      }
    }
    ringBase += (rings + 1) * radialSegments;
  }

  const cuts = TIP_PARAMS.map((tp) => ({
    asc: applySink(curve.getPointAt((tp - cutWindow + 1) % 1), junctionSink),
    desc: applySink(curve.getPointAt((tp + cutWindow) % 1), junctionSink),
  }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, cuts };
}
