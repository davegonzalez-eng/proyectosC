// Dodecahedron + per-face star geometry math.
//
// The dodecahedron is built as the polar dual of a regular icosahedron:
//   - each icosahedron FACE centroid (normalized to the sphere) becomes a
//     dodecahedron VERTEX
//   - each icosahedron VERTEX becomes a dodecahedron FACE, whose 5 corners
//     are the (now-dual) centroids of the 5 icosahedron faces around it
//
// This gives exact, symmetric regular-pentagon faces without hand-typed
// pentagon vertex tables, and a natural per-face local (U, W, N) frame to
// draw a flat star in, matching what a real Quin-style piece would later
// wrap onto a curved/printed surface.

import * as THREE from 'three';

const PHI = (1 + Math.sqrt(5)) / 2;

// Standard icosahedron vertex/face reference data (unit-ish coordinates).
const ICOSA_VERTS = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const ICOSA_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const ARMS_PER_FACE = 5;

/**
 * Build the 12 pentagonal faces of a regular dodecahedron, each with a
 * local right-handed (U, W, N) frame suitable for drawing a flat 2D star
 * that is later mapped into world space.
 *
 * @param {number} radius circumradius of the dodecahedron
 * @returns {Array<Face>} 12 faces, index = face label F<index>
 */
export function buildDodecahedron(radius = 1) {
  const icosaVerts = ICOSA_VERTS.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

  // Dual vertex per icosahedron face = normalized centroid of its 3 verts.
  const dualVerts = ICOSA_FACES.map(([a, b, c]) => {
    const p = new THREE.Vector3()
      .add(icosaVerts[a]).add(icosaVerts[b]).add(icosaVerts[c])
      .multiplyScalar(1 / 3)
      .normalize()
      .multiplyScalar(radius);
    return p;
  });

  // Which dual faces touch each icosahedron vertex.
  const facesAtVertex = icosaVerts.map(() => []);
  ICOSA_FACES.forEach((tri, fIdx) => {
    tri.forEach((vi) => facesAtVertex[vi].push(fIdx));
  });

  const faces = icosaVerts.map((vPos, faceIndex) => {
    const normal = vPos.clone().normalize();

    // Build an arbitrary orthonormal basis first, just to sort corners by
    // angle; the real U axis (angle 0) gets re-anchored to corner 0 below.
    const helper = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tmpU = helper.clone().sub(normal.clone().multiplyScalar(helper.dot(normal))).normalize();
    const tmpW = normal.clone().cross(tmpU).normalize();

    const cornerFaceIdxs = facesAtVertex[faceIndex]; // 5 icosa-face indices
    const cornerPositions = cornerFaceIdxs.map((fi) => dualVerts[fi]);
    const center = cornerPositions
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / cornerPositions.length);

    const withAngle = cornerPositions.map((p) => {
      const r = p.clone().sub(center);
      const u = r.dot(tmpU);
      const w = r.dot(tmpW);
      return { p, angle: Math.atan2(w, u) };
    });
    withAngle.sort((a, b) => a.angle - b.angle);
    const vertices3D = withAngle.map((e) => e.p);

    // Re-anchor U to point at corner 0 so arm/vertex index 0 sits at
    // angle 0 exactly - makes labeling and swirl math easier to reason about.
    const U = vertices3D[0].clone().sub(center).normalize();
    const W = normal.clone().cross(U).normalize();
    const R_out = vertices3D[0].clone().sub(center).length();

    return {
      index: faceIndex,
      label: `F${faceIndex}`,
      center,
      normal,
      U,
      W,
      R_out,
      vertices3D,
    };
  });

  return faces;
}

/**
 * Convert a local 2D (u, w) coordinate on a face's plane to world space,
 * with an optional bulge displacement along the face normal - the hook
 * for eventually curving the flat face into a domed/printed surface.
 */
function toWorld(face, u, w, bulgeHeight) {
  return face.center.clone()
    .addScaledVector(face.U, u)
    .addScaledVector(face.W, w)
    .addScaledVector(face.normal, bulgeHeight || 0);
}

/**
 * Distort a single (angle, radius) polar sample with:
 *   - a counter-clockwise swirl whose strength grows with radius
 *   - a radial "wave" ripple: r' = r + (r/k) * sin(k * r)
 *   - an optional dome bulge along the face normal
 *
 * r2 (the "distance to star center") is always the *undistorted* radius,
 * matching the spec: the wave and swirl amounts are both functions of the
 * original r2, not of each other.
 */
function distortPoint(face, angle, r2, params) {
  const { swirlRad, k, waveEnabled, bulgeStrength } = params;

  const swirlTheta = angle + swirlRad * (r2 / face.R_out);

  let rFinal = r2;
  if (waveEnabled && k !== 0) {
    rFinal = r2 + (r2 / k) * Math.sin(k * r2);
  }

  const u = rFinal * Math.cos(swirlTheta);
  const w = rFinal * Math.sin(swirlTheta);

  const bulge = bulgeStrength
    ? bulgeStrength * (1 - Math.pow(r2 / face.R_out, 2))
    : 0;

  return toWorld(face, u, w, bulge);
}

/**
 * Build the swirled + waved 5-pointed star for one face.
 *
 * @param {Face} face
 * @param {object} params
 * @param {number} params.swirlDeg   swirl angle (deg) applied at r = R_out, CCW positive
 * @param {number} params.k          wave frequency/denominator, r' = r + (r/k)*sin(k*r)
 * @param {boolean} params.waveEnabled
 * @param {number} params.innerRatio inner-vertex radius as a fraction of R_out (classic pentagram ~ 1/phi^2 = 0.382)
 * @param {number} params.tipScale   outer-vertex radius as a fraction of R_out (<=1, gives breathing room from the face edge)
 * @param {number} params.bulgeStrength dome height at the face center (0 = flat)
 * @returns {StarResult}
 */
export function buildStar(face, params) {
  const swirlRad = THREE.MathUtils.degToRad(params.swirlDeg || 0);
  const p = { ...params, swirlRad };

  const baseAngle = (i) => {
    const v = face.vertices3D[i].clone().sub(face.center);
    return Math.atan2(v.dot(face.W), v.dot(face.U));
  };

  const tipR = face.R_out * (params.tipScale ?? 1);
  const innerR = face.R_out * (params.innerRatio ?? 0.382);

  const tips = [];
  const outline = [];
  for (let i = 0; i < ARMS_PER_FACE; i++) {
    const tipAngle = baseAngle(i);
    const tipPos = distortPoint(face, tipAngle, tipR, p);
    tips.push({
      label: `F${face.index}-A${i}`,
      faceIndex: face.index,
      armIndex: i,
      position: tipPos,
      outDir: tipPos.clone().sub(face.center).normalize(),
    });

    const innerAngle = tipAngle + Math.PI / ARMS_PER_FACE; // halfway to next tip
    const innerPos = distortPoint(face, innerAngle, innerR, p);

    outline.push(tipPos, innerPos);
  }

  return { faceIndex: face.index, tips, outline };
}

export const ARMS = ARMS_PER_FACE;
