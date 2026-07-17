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
 * Distort a single (angle, radius) polar sample with:
 *   - a counter-clockwise swirl (about the face normal) whose strength
 *     grows with radius
 *   - a radial "wave" ripple: r' = r + (r/k) * sin(k * r)
 *   - an optional dome bulge along the face normal
 *   - a second, independent "blade" twist about the arm's own outward axis
 *     (face center -> that arm's undistorted tip), which banks the point
 *     out of the face plane the further out it sits - like a propeller
 *     blade twisting along its own length, layered on top of the in-plane
 *     swirl rather than replacing it
 *
 * r2 (the "distance to star center") is always the *undistorted* radius,
 * matching the spec: the wave and swirl amounts are both functions of the
 * original r2, not of each other.
 */
function distortPoint(face, angle, r2, armAxis, params) {
  const { swirlRad, k, waveEnabled, bulgeStrength, armTwistRad } = params;

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

  const offset = face.U.clone()
    .multiplyScalar(u)
    .addScaledVector(face.W, w)
    .addScaledVector(face.normal, bulge);

  if (armTwistRad && armAxis) {
    offset.applyAxisAngle(armAxis, armTwistRad * (r2 / face.R_out));
  }

  return { world: face.center.clone().add(offset), u, w };
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
 * @param {number} params.armTwistDeg  second "blade" swirl (deg) about each arm's own outward axis, applied at r = R_out
 * @returns {StarResult}
 */
export function buildStar(face, params) {
  const swirlRad = THREE.MathUtils.degToRad(params.swirlDeg || 0);
  const armTwistRad = THREE.MathUtils.degToRad(params.armTwistDeg || 0);
  const p = { ...params, swirlRad, armTwistRad };

  const baseAngle = (i) => {
    const v = face.vertices3D[i].clone().sub(face.center);
    return Math.atan2(v.dot(face.W), v.dot(face.U));
  };
  const armAxis = (i) => face.vertices3D[i].clone().sub(face.center).normalize();

  const tipR = face.R_out * (params.tipScale ?? 1);
  const innerR = face.R_out * (params.innerRatio ?? 0.382);

  const tips = [];
  const outline = [];
  const outline2D = [];
  for (let i = 0; i < ARMS_PER_FACE; i++) {
    const tipAngle = baseAngle(i);
    const axis = armAxis(i); // both this arm's tip and its trailing inner point twist about the same blade axis
    const tip = distortPoint(face, tipAngle, tipR, axis, p);
    tips.push({
      label: `F${face.index}-A${i}`,
      faceIndex: face.index,
      armIndex: i,
      position: tip.world,
      outDir: tip.world.clone().sub(face.center).normalize(),
    });

    const innerAngle = tipAngle + Math.PI / ARMS_PER_FACE; // halfway to next tip
    const inner = distortPoint(face, innerAngle, innerR, axis, p);

    outline.push(tip.world, inner.world);
    outline2D.push({ u: tip.u, w: tip.w }, { u: inner.u, w: inner.w });
  }

  return { faceIndex: face.index, tips, outline, outline2D };
}

export const ARMS = ARMS_PER_FACE;

const vertexKey = (v) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;

/**
 * Group star arms by the (undistorted) dodecahedron vertex they sit at.
 * Every vertex of a regular dodecahedron is shared by exactly 3 faces, so
 * this returns 20 groups of 3 {faceIndex, armIndex} entries.
 */
export function groupArmsByVertex(faces) {
  const groups = new Map();
  for (const face of faces) {
    face.vertices3D.forEach((v, armIndex) => {
      const k = vertexKey(v);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ faceIndex: face.index, armIndex });
    });
  }
  return [...groups.values()];
}

/**
 * The "adjacent faces landing on the star" connection rule, reverse-engineered
 * from a reference set of 5 connections onto face 7:
 *
 *   F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1
 *
 * For a face F and arm index m, take the edge of F between its vertices
 * (m+1) and (m+2) (mod 5). That edge is shared with exactly one neighbor
 * face G. Connect F's arm m to G's arm at the (m+2) vertex (the far end of
 * that edge, i.e. G's own arm that sits at the same physical corner).
 *
 * Applied uniformly across all 12 faces x 5 arms this yields exactly 60
 * unique ribbons with every arm touched by exactly two of them (once as the
 * "m" arm of its own face, once as the landing arm from a neighbor) -
 * verified to reproduce the reference set exactly when F = face 7.
 */
export function computeAdjacentFaceConnections(faces) {
  const groups = groupArmsByVertex(faces);
  const byVertexKey = new Map();
  faces.forEach((face) => {
    face.vertices3D.forEach((v, armIndex) => {
      byVertexKey.set(`${face.index}:${armIndex}`, vertexKey(v));
    });
  });
  // vertexKey -> [{faceIndex, armIndex}, ...]
  const atVertex = new Map();
  groups.forEach((g) => atVertex.set(vertexKey(faces[g[0].faceIndex].vertices3D[g[0].armIndex]), g));

  const pairs = [];
  for (const face of faces) {
    for (let m = 0; m < ARMS_PER_FACE; m++) {
      const startVKey = byVertexKey.get(`${face.index}:${(m + 1) % ARMS_PER_FACE}`);
      const endVKey = byVertexKey.get(`${face.index}:${(m + 2) % ARMS_PER_FACE}`);
      const facesAtStart = atVertex.get(startVKey).map((e) => e.faceIndex);
      const entriesAtEnd = atVertex.get(endVKey).filter((e) => e.faceIndex !== face.index);
      const landing = entriesAtEnd.find((e) => facesAtStart.includes(e.faceIndex));
      if (!landing) continue; // shouldn't happen on a closed dodecahedron
      pairs.push({ a: `F${face.index}-A${m}`, b: `F${landing.faceIndex}-A${landing.armIndex}` });
    }
  }
  return pairs;
}
