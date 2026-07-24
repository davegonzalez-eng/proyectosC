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

// Exponent controlling how early the tip-dip pull "kicks in" along an arm's
// length. Lower = starts sooner / more gradual ramp (still reaches exactly
// `tipDipStrength` when the post-wave radius equals R_out, regardless of
// exponent, since (r/R)^n = 1 there for any n - only the onset shape changes).
const TIP_DIP_POWER = 1.6;
// Exponent for the extra "curl" rotation layered near the tip - separate
// from TIP_DIP_POWER so the curl and the inward pull can ramp at different
// rates if tuned differently later.
const CURL_POWER = 1.6;

/**
 * Pull `world` inward toward the sphere's center (the origin, since the
 * dodecahedron is built centered there), by an amount that grows with
 * `radius` and is concentrated near a star's tip. Shared by both the
 * star's own point placement (`distortPoint`) and anything else that needs
 * to place points consistent with the star surface (e.g. the hex-grid
 * fill), so the two can't drift apart the way an inlined duplicate would.
 *
 * `radius` must be the *post-wave* radius (sqrt(u^2 + w^2) in the face's
 * local frame), not the original undistorted one - that's what makes this
 * reconstructible from a bare (u, w) pair with no other context, which the
 * hex-grid fill's newly-generated interior points depend on.
 */
export function applyTipDip(world, radius, face, tipDipStrength) {
  if (!tipDipStrength) return world;
  const dip = tipDipStrength * Math.pow(radius / face.R_out, TIP_DIP_POWER);
  return world.addScaledVector(world.clone().normalize(), -dip);
}

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
 *   - a "curl": extra swirl rotation layered on top, concentrated near the
 *     tip (r2/R_out)^CURL_POWER - so the arm spirals a bit as it approaches
 *     its end rather than sweeping at one constant rate the whole way
 *   - a radial "wave" ripple: r' = r + (r/k) * sin(k * r)
 *   - an optional dome bulge along the face normal
 *   - a second, independent "blade" twist about the arm's own outward axis
 *     (face center -> that arm's undistorted tip), which banks the point
 *     out of the face plane the further out it sits - like a propeller
 *     blade twisting along its own length, layered on top of the in-plane
 *     swirl rather than replacing it
 *   - a "tip dip" (see `applyTipDip`): an inward pull toward the *sphere's*
 *     center, ramping up gradually well before the tip rather than only in
 *     the last moment, so the arm curls into the body over a visible
 *     stretch instead of turning sharply right at the very end
 *
 * r2 (the "distance to star center") is always the *undistorted* radius,
 * matching the spec: swirl, curl and wave are all functions of the original
 * r2, not of each other. Bulge and tip-dip, however, are deliberately
 * functions of `rFinal` (the radius *after* the wave) rather than r2 - that
 * makes them exactly reconstructible from a bare (u, w) pair alone
 * (rFinal = sqrt(u^2 + w^2) by construction), which anything that needs to
 * place *new* points directly in (u, w) space - the hex-grid fill, which
 * doesn't have an original r2 to work from - depends on to stay flush with
 * the star's own surface.
 */
function distortPoint(face, angle, r2, armAxis, params) {
  const { swirlRad, k, waveEnabled, bulgeStrength, armTwistRad, tipDipStrength, curlRad, surfTwistRad } = params;

  const curl = curlRad ? curlRad * Math.pow(r2 / face.R_out, CURL_POWER) : 0;
  const swirlTheta = angle + swirlRad * (r2 / face.R_out) + curl;

  let rFinal = r2;
  if (waveEnabled && k !== 0) {
    rFinal = r2 + (r2 / k) * Math.sin(k * r2);
  }

  const u = rFinal * Math.cos(swirlTheta);
  const w = rFinal * Math.sin(swirlTheta);

  const bulge = bulgeStrength
    ? bulgeStrength * (1 - Math.pow(rFinal / face.R_out, 2))
    : 0;

  const offset = applySurfaceTwist(face, u, w, bulge, surfTwistRad);

  if (armTwistRad && armAxis) {
    offset.applyAxisAngle(armAxis, armTwistRad * (r2 / face.R_out));
  }

  const world = applyTipDip(face.center.clone().add(offset), rFinal, face, tipDipStrength);

  return { world, u, w };
}

/**
 * Build a point's offset from the face center out of its final in-plane
 * coordinates (u, w) and dome height, twisting the surface as it goes: the
 * dome (normal) component is rotated counter-clockwise about the point's
 * own in-plane radial direction, by an angle growing toward the star's rim
 * as (r/R_out)^CURL_POWER - like the ribbons' twist, but for the star
 * surface, in the planes perpendicular to the direction each arm runs.
 * The in-plane part lies exactly along the rotation axis, so it is
 * untouched; only the dome leans sideways (toward the CCW tangential
 * direction), rolling the shells so arms can duck under their neighbors.
 *
 * Shared by `distortPoint` and the hex-grid fill: everything here is a
 * function of (u, w, bulge) alone, so tube outline and fill compute the
 * identical twist and stay flush at their boundary.
 */
export function applySurfaceTwist(face, u, w, bulge, surfTwistRad) {
  const r = Math.sqrt(u * u + w * w);
  if (!surfTwistRad || r < 1e-9) {
    return face.U.clone()
      .multiplyScalar(u)
      .addScaledVector(face.W, w)
      .addScaledVector(face.normal, bulge);
  }
  const phi = surfTwistRad * Math.pow(r / face.R_out, CURL_POWER);
  const radDir = face.U.clone().multiplyScalar(u / r).addScaledVector(face.W, w / r);
  const tangential = new THREE.Vector3().crossVectors(face.normal, radDir); // CCW in-plane direction
  return radDir
    .multiplyScalar(r)
    .addScaledVector(face.normal, bulge * Math.cos(phi))
    .addScaledVector(tangential, bulge * Math.sin(phi));
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
 * @param {number} params.tipDipStrength inward pull toward the sphere's center, ramping in ahead of the tip (world units at r2 = R_out)
 * @param {number} params.curlDeg     extra swirl rotation (deg) concentrated near the tip, applied at r2 = R_out
 * @param {number} params.surfTwistDeg CCW twist of the surface's dome about each point's radial direction (deg at r = R_out), see applySurfaceTwist
 * @returns {StarResult}
 */
export function buildStar(face, params) {
  const swirlRad = THREE.MathUtils.degToRad(params.swirlDeg || 0);
  const armTwistRad = THREE.MathUtils.degToRad(params.armTwistDeg || 0);
  const curlRad = THREE.MathUtils.degToRad(params.curlDeg || 0);
  const surfTwistRad = THREE.MathUtils.degToRad(params.surfTwistDeg || 0);
  const p = { ...params, swirlRad, armTwistRad, curlRad, surfTwistRad };

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

    // The arm's own trend as it approaches the tip: swirl, wave, bulge and
    // arm-twist are all functions of r, so the arm's tube is generally
    // *not* heading straight outward right before the tip - the bulge in
    // particular is falling back toward the flat rim, so the arm is
    // already "dipping" toward a lower radius. Sample the curve a hair
    // before the tip (backward difference) so a ribbon leaving from here
    // can continue that same trend instead of resetting to a purely
    // radial direction first.
    const tangentStep = Math.max(face.R_out * 0.015, 1e-4);
    const tipBack = distortPoint(face, tipAngle, tipR - tangentStep, axis, p);
    const tangent = tip.world.clone().sub(tipBack.world).normalize();

    tips.push({
      label: `F${face.index}-A${i}`,
      faceIndex: face.index,
      armIndex: i,
      position: tip.world,
      outDir: tip.world.clone().sub(face.center).normalize(),
      tangent,
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
 * For face F and arm m, the single "adjacent faces landing on the star"
 * rule reverse-engineered from a reference set of 5 connections onto face 7:
 *
 *   F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1
 *
 * Take the edge of F between its vertices (m+1) and (m+2) (mod 5). That
 * edge is shared with exactly one neighbor face G. F's arm m connects to
 * G's arm at the (m+2) vertex (the far end of that edge, i.e. G's own arm
 * at the same physical corner).
 */
function ruleForArm(faces, atVertex, byVertexKey, face, m) {
  const startVKey = byVertexKey.get(`${face.index}:${(m + 1) % ARMS_PER_FACE}`);
  const endVKey = byVertexKey.get(`${face.index}:${(m + 2) % ARMS_PER_FACE}`);
  const facesAtStart = atVertex.get(startVKey).map((e) => e.faceIndex);
  const entriesAtEnd = atVertex.get(endVKey).filter((e) => e.faceIndex !== face.index);
  return entriesAtEnd.find((e) => facesAtStart.includes(e.faceIndex)); // {faceIndex, armIndex} or undefined
}

/**
 * Applies `ruleForArm` identically to every face's every arm - the same
 * logic run 60 times with no special-casing. This is exactly what a second
 * reference set (5 connections onto face 1) confirmed is wanted: every one
 * of F1's own rule outputs is kept unmodified, just as every one of F7's
 * was in the original reference. Verified to reproduce both reference sets
 * exactly.
 *
 * Because a given arm can be both the "m" source of its own face's rule and
 * the landing target of a neighboring face's rule, this yields 60 edges
 * with every arm touched by exactly two ribbons - which is what "every arm
 * connected" means here: no arm is left with zero ribbons.
 */
export function computeAdjacentFaceConnections(faces) {
  const groups = groupArmsByVertex(faces);
  const byVertexKey = new Map();
  faces.forEach((face) => {
    face.vertices3D.forEach((v, armIndex) => {
      byVertexKey.set(`${face.index}:${armIndex}`, vertexKey(v));
    });
  });
  const atVertex = new Map();
  groups.forEach((g) => atVertex.set(vertexKey(faces[g[0].faceIndex].vertices3D[g[0].armIndex]), g));

  const pairs = [];
  for (const face of faces) {
    for (let m = 0; m < ARMS_PER_FACE; m++) {
      const landing = ruleForArm(faces, atVertex, byVertexKey, face, m);
      if (!landing) continue; // shouldn't happen on a closed dodecahedron
      pairs.push({ a: `F${face.index}-A${m}`, b: `F${landing.faceIndex}-A${landing.armIndex}` });
    }
  }
  return pairs;
}

/**
 * Groups `computeAdjacentFaceConnections`'s 60 pairs into their 20 closed
 * 3-cycles - one per dodecahedron vertex, where three faces' arm tips meet
 * (the "circular horn triangle"). The pairs alone only say "these two tips
 * connect"; nothing in that list is explicitly grouped into threes, so
 * every connector built directly off `connections` so far (`buildHornArc`)
 * has only ever needed ONE pair at a time. The snap-joint hub piece and the
 * spiral-vortex connector both need all three tips of a vertex at once
 * (the hub's three pegs, the vortex's shared convergence point), hence
 * this.
 *
 * Built by brute-force triangle-finding on the small (60-node) adjacency
 * graph: for every label, for every pair of its neighbors, if those two
 * neighbors are ALSO connected to each other, the three form a closed
 * triangle. Every edge in this graph belongs to exactly one such triangle
 * (verified under Node: 20 cycles, every one length 3, covering all 60
 * pairs with no leftovers), so a plain neighbor-lookup dedup finds all 20
 * with no need for a general cycle-detection algorithm.
 * @param {{a: string, b: string}[]} connections
 * @returns {string[][]} 20 triples of labels, e.g. ['F0-A0', 'F1-A4', 'F2-A2']
 */
export function computeThreeCycles(connections) {
  const neighbors = new Map();
  const add = (a, b) => {
    if (!neighbors.has(a)) neighbors.set(a, []);
    neighbors.get(a).push(b);
  };
  for (const { a, b } of connections) {
    add(a, b);
    add(b, a);
  }
  const hasEdge = (a, b) => (neighbors.get(a) || []).includes(b);

  const seen = new Set();
  const triples = [];
  for (const [label, nbrs] of neighbors) {
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        const n1 = nbrs[i], n2 = nbrs[j];
        if (!hasEdge(n1, n2)) continue;
        const key = [label, n1, n2].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        triples.push([label, n1, n2]);
      }
    }
  }
  return triples;
}
