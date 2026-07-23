// Option B prototype: replace the current 5-thin-arm star with 5 wide,
// logarithmic-spiral "paisley" arms per face - `buildSpiralBand` builds one
// such arm, `buildSpiralStar` places `armCount` (default 5) rotated copies
// of it to form the whole face's motif. A single arm/coil covering the
// whole face (the first version of this prototype) reads as a blob or a
// donut, not a star - the star's identity comes from having 5 distinct
// arms with visible gaps between them, each only curling partway to the
// center, not one shape sweeping across the entire face.
//
// This is a NEW, separate module (not an in-place edit of geometry.js /
// startube.js) precisely so the old 5-thin-arm approach stays intact as a
// fallback/reference while this is being validated in isolation - see
// spiral-prototype.html, which renders exactly one face with this motif and
// nothing else from the rest of the app.
//
// Centerline (one arm): a logarithmic spiral r(theta) = r0 * exp(-k*theta),
// starting at the face rim (theta = 0, r = r0, angle = the same "vertex 0"
// direction the old star's arm 0 tip used, offset by `angleOffset` for arms
// 1-4) and spiraling inward over `turns` turns down to a target inner
// radius near the face center - the hub, where the band is at its widest
// (see below) and all `armCount` arms converge/overlap. Setting
// `holeLoopTurns` > 0 continues the path at ~constant radius for that many
// more turns before ending, instead of stopping right at the hub radius.
//
// The slab cross-section (major = width direction, minor = thickness
// direction) is built the same way startube.js orients its flattened cut
// ends: major = cross(tangent, radial-from-sphere-center), so the band lies
// flat against the sphere's surface everywhere along its length, not just
// at its endpoints. Width and thickness continuously taper from a narrow
// `tipWidthFrac`/`tipThicknessFrac` at the tip (theta=0, the rim/outer end -
// "tip" here matches the rest of the codebase's convention, e.g.
// geometry.js's `star.tips`, which are the OUTER points) up to their
// widest at the hub (the inner end near the face center, where all
// `armCount` arms converge) - like a real 5-pointed star, narrow at each
// outward point and solid/overlapping at the body where the points join,
// not the reverse.

import * as THREE from 'three';
import { applySurfaceTwist, applyTipDip } from './geometry.js';

/**
 * @param {Face} face from buildDodecahedron
 * @param {object} [params]
 * @param {number} [params.turns=1.4] spiral turns from the rim down to the hub radius
 * @param {number} [params.holeLoopTurns=0.85] extra turns at ~constant radius past the hub before ending - originally meant to close a terminal eye-hole, but since the taper is now widest at the hub (see `bandHalfWidth`), a loop here currently continues at that full width rather than narrowing into an open ring; revisit if the eye-hole is reintroduced
 * @param {number} [params.tipScale=0.95] starting radius at the rim, as a fraction of face.R_out
 * @param {number} [params.hubRadiusFrac=0.16] hub radius (the inner end all arms converge on), as a fraction of face.R_out
 * @param {number} [params.bandHalfWidth=0.22] half-width of the band at the hub (fraction of face.R_out, reached at the inner end near the face center where all arms converge) - its widest point, tapering down to `tipWidthFrac` of this out at the tip
 * @param {number} [params.tipWidthFrac=0.15] half-width at the tip (theta=0, the rim/outer end, matching geometry.js's `star.tips` convention), as a fraction of `bandHalfWidth` - should be small, like a real star's narrow outward point
 * @param {number} [params.widthTaperPower=1] shapes the taper curve (fraction of the way from tip to hub, raised to this power, drives the lerp from `tipWidthFrac` up to full `bandHalfWidth`): 1 = linear, >1 stays narrow near the tip longer then widens sharply close to the hub, <1 widens quickly and stays wide for most of the length
 * @param {number} [params.thickness=0.05] slab thickness (fraction of face.R_out) at the hub, tapering the same way width does
 * @param {number} [params.tipThicknessFrac=0.5] thickness at the tip, as a fraction of `thickness` - kept well above 0 so the tapered point doesn't collapse to a degenerate zero-thickness edge
 * @param {number} [params.bulgeStrength=0] dome height at the face center, same convention as buildStar
 * @param {number} [params.tipDipStrength=0] inward pull toward the sphere center, same convention as buildStar
 * @param {number} [params.surfTwistDeg=0] surface twist (deg), same convention as buildStar's applySurfaceTwist
 * @param {number} [params.segments=240] arc-length-resampled extrusion stations
 * @param {number} [params.samples=500] raw parametric samples used to build the resampling curve
 * @param {number} [params.angleOffset=0] rotates the whole arm's starting angle (rad) about the face normal - used by `buildSpiralStar` to place `armCount` copies at even rotations
 * @returns {{geometry: THREE.BufferGeometry, curve: THREE.CatmullRomCurve3, points: THREE.Vector3[], metrics: object}}
 */
export function buildSpiralBand(face, params = {}) {
  const {
    turns = 1.4,
    holeLoopTurns = 0.85,
    tipScale = 0.95,
    hubRadiusFrac = 0.16,
    bandHalfWidth = 0.22,
    tipWidthFrac = 0.15,
    widthTaperPower = 1,
    thickness = 0.05,
    tipThicknessFrac = 0.5,
    bulgeStrength = 0,
    tipDipStrength = 0,
    surfTwistDeg = 0,
    segments = 240,
    samples = 500,
    angleOffset = 0,
  } = params;

  const surfTwistRad = THREE.MathUtils.degToRad(surfTwistDeg);
  const R = face.R_out;
  const r0 = R * tipScale;
  const hubRadius = R * hubRadiusFrac;
  const spiralThetaMax = turns * Math.PI * 2;
  const kSpiral = Math.log(r0 / hubRadius) / spiralThetaMax;
  const loopThetaMax = holeLoopTurns * Math.PI * 2;
  const thetaTotal = spiralThetaMax + loopThetaMax;
  const bandHalfWidthWorld = R * bandHalfWidth;
  const thicknessWorld = R * thickness;

  const place = (theta) => {
    const r = theta <= spiralThetaMax ? r0 * Math.exp(-kSpiral * theta) : hubRadius;
    // Negated so the arm sweeps counter-clockwise (tip to hub) as seen from
    // outside the sphere looking at this face - matches the visual read of
    // the whole pinwheel's spin direction (dominated by which way the
    // wide trailing edge leans, not just the raw parametric direction).
    const angle = angleOffset - theta;
    const u = r * Math.cos(angle);
    const w = r * Math.sin(angle);
    const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(r / R, 2)) : 0;
    const world = face.center.clone().add(applySurfaceTwist(face, u, w, bulge, surfTwistRad));
    applyTipDip(world, r, face, tipDipStrength);
    return world;
  };

  const rawPoints = [];
  for (let i = 0; i <= samples; i++) {
    rawPoints.push(place((thetaTotal * i) / samples));
  }

  const curve = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.5);
  const points = curve.getSpacedPoints(segments);

  // Where (as an ARC-LENGTH fraction, matching the `t` used below) the hub
  // is reached and any closing loop begins - needed because the spiral's
  // own parameter (uniform in theta) is very much NOT uniform in arc
  // length: the tight inner turns near the hub cover far less distance per
  // radian than the wide outer turns near the rim, so a theta-fraction
  // can't be used directly against the arc-length-resampled stations.
  let iSpiralEnd = Math.round(samples * (spiralThetaMax / thetaTotal));
  let cumLen = 0;
  let spiralEndLen = 0;
  for (let i = 1; i <= samples; i++) {
    cumLen += rawPoints[i].distanceTo(rawPoints[i - 1]);
    if (i === iSpiralEnd) spiralEndLen = cumLen;
  }
  const spiralFrac = cumLen > 0 ? spiralEndLen / cumLen : 1;

  const stations = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = points[i];
    const tangent = curve.getTangentAt(t);
    const radial = p.clone().normalize();
    const major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) major.set(1, 0, 0);
    major.normalize();
    const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();

    // Continuous taper from a narrow `tipWidthFrac`/`tipThicknessFrac` at
    // the tip (t=0, the rim/outer point) up to full width/thickness at the
    // hub (the inner end near the face center) - across the WHOLE spiral
    // body, not just a last-moment widening, so the arm reads as a real
    // star point the whole way, not a paddle with a pinched-in tip.
    // Normalized against `spiralFrac` (not raw t) so the taper always
    // finishes exactly where the spiral body ends - at the hub if there's
    // no closing loop, or at the loop's own start if there is one. (A
    // closing loop past that point currently continues at the hub's full
    // width rather than narrowing back down - fine while `holeLoopTurns`
    // defaults to 0; revisit if the eye-hole loop is reintroduced, since an
    // open ring needs to stay narrow through the whole loop.)
    const bodyT = spiralFrac > 0 ? Math.min(t / spiralFrac, 1) : 1;
    const taperCurve = Math.pow(bodyT, widthTaperPower);
    const widthFrac = THREE.MathUtils.lerp(tipWidthFrac, 1, taperCurve);
    const halfWidth = bandHalfWidthWorld * widthFrac;
    const halfT = (thicknessWorld * THREE.MathUtils.lerp(tipThicknessFrac, 1, taperCurve)) / 2;

    stations.push({
      topA: p.clone().addScaledVector(major, halfWidth).addScaledVector(minor, halfT),
      topB: p.clone().addScaledVector(major, -halfWidth).addScaledVector(minor, halfT),
      botA: p.clone().addScaledVector(major, halfWidth).addScaledVector(minor, -halfT),
      botB: p.clone().addScaledVector(major, -halfWidth).addScaledVector(minor, -halfT),
    });
  }

  const positions = [];
  const indices = [];

  const addStrip = (vertPair) => {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const [va, vb] = vertPair(stations[i]);
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2, b = a + 1, c = base + (i + 1) * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  };

  addStrip((s) => [s.topA, s.topB]);
  addStrip((s) => [s.botB, s.botA]);
  addStrip((s) => [s.topA, s.botA]);
  addStrip((s) => [s.botB, s.topB]);

  // Flat rectangular caps at both open ends so the slab reads as a solid
  // band rather than a hollow shell - the narrow tip end (future fusion
  // point) and the wide hub end near the face center.
  const pushCap = (station, flip) => {
    const base = positions.length / 3;
    const verts = [station.topA, station.topB, station.botB, station.botA];
    for (const v of verts) positions.push(v.x, v.y, v.z);
    if (!flip) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  pushCap(stations[0], false);
  pushCap(stations[segments], true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const metrics = {
    bandWidthOverFaceRadius: (2 * bandHalfWidthWorld) / R,
    totalTurningDeg: THREE.MathUtils.radToDeg(thetaTotal),
    hubRadiusOverBandWidth: hubRadius / (2 * bandHalfWidthWorld),
  };

  return { geometry, curve, points, metrics };
}

/**
 * A small filled disc plugging the exact center of the face. Each arm's
 * wide hub end sits AT `hubRadiusFrac`, not through the true center point -
 * with `armCount` arms rotated evenly around it, their hub ends form a tiny
 * regular polygon around the center rather than actually meeting there, so
 * even a very wide taper leaves a hairline gap right at the middle. Rather
 * than chase that gap through taper-curve tuning, this explicitly fills a
 * disc of radius `capRadiusFrac` (comfortably bigger than `hubRadiusFrac`,
 * so it overlaps each arm's own already-wide-by-then coverage well before
 * their hub ends) at the same thickness and bulge/twist as the arms, so
 * the center reads as solid with no visible gap regardless of exactly how
 * the arms' own taper lines up.
 *
 * @param {Face} face
 * @param {object} [params]
 * @param {number} [params.capRadiusFrac=0.06] disc radius, as a fraction of face.R_out
 * @param {number} [params.thickness=0.05] slab thickness (fraction of face.R_out), matching the arms' own hub thickness
 * @param {number} [params.bulgeStrength=0]
 * @param {number} [params.segments=32] outline point count
 * @returns {THREE.BufferGeometry}
 */
export function buildHubCap(face, params = {}) {
  const { capRadiusFrac = 0.06, thickness = 0.05, bulgeStrength = 0, segments = 32 } = params;

  const R = face.R_out;
  const capRadius = R * capRadiusFrac;
  const halfT = (R * thickness) / 2;
  const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(capRadius / R, 2)) : 0;

  const ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const u = capRadius * Math.cos(a);
    const w = capRadius * Math.sin(a);
    ring.push(
      face.center.clone()
        .addScaledVector(face.U, u)
        .addScaledVector(face.W, w)
        .addScaledVector(face.normal, bulge)
    );
  }
  const center = face.center.clone().addScaledVector(face.normal, bulge);

  const positions = [];
  const indices = [];
  const pushLayer = (offset, flip) => {
    const base = positions.length / 3;
    const c = center.clone().addScaledVector(face.normal, offset);
    positions.push(c.x, c.y, c.z);
    for (const p of ring) {
      const rp = p.clone().addScaledVector(face.normal, offset);
      positions.push(rp.x, rp.y, rp.z);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + 1 + i, b = base + 1 + ((i + 1) % segments);
      if (!flip) indices.push(base, a, b);
      else indices.push(base, b, a);
    }
  };
  pushLayer(halfT, false);
  pushLayer(-halfT, true);

  // Side wall so the cap has real thickness at its rim, matching the arms.
  const topBase = 0, botBase = segments + 1;
  for (let i = 0; i < segments; i++) {
    const iNext = (i + 1) % segments;
    const t0 = topBase + 1 + i, t1 = topBase + 1 + iNext;
    const b0 = botBase + 1 + i, b1 = botBase + 1 + iNext;
    indices.push(t0, b0, t1, t1, b0, b1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A single spiral band, by itself, reads as one big coil - not a star: the
 * pentagon face's 5-fold identity comes from having 5 arms, one per vertex
 * direction, each curling only part of the way to the center rather than
 * one arm sweeping the whole face. This places `armCount` (default 5, one
 * per pentagon vertex - the same "vertex 0, 1, 2..." directions the old
 * 5-thin-arm star used, so a future version can reuse the same rim
 * connection points) rotated copies of `buildSpiralBand` and merges them
 * into a single geometry - a pinwheel of wide, curling, tapered blades
 * instead of either 5 thin arms or 1 giant coil.
 *
 * A `buildHubCap` disc is merged in too, plugging the small gap that would
 * otherwise remain at the exact center (see `buildHubCap`'s docs).
 *
 * `starRotationDeg` rotates the WHOLE star about its face normal (every
 * arm's starting angle shifted together). With the same rotation applied
 * on every face, each arm's tip no longer points at its pentagon vertex -
 * it reaches across the face edge toward a GAP between two arms of the
 * (equally rotated) neighboring star, which is what lets arms visually
 * dive under their neighbors instead of meeting them point-to-point at
 * the shared vertex. Same idea as the "OFFSET (star rotation)" control in
 * the earlier Quin raymarched study this borrows from.
 *
 * @param {Face} face
 * @param {object} [params] same as `buildSpiralBand` (`angleOffset` is set internally per arm and ignored if passed), plus `buildHubCap`'s `capRadiusFrac`
 * @param {number} [params.armCount=5]
 * @param {number} [params.starRotationDeg=0] rotates the whole star about the face normal (deg, CCW)
 * @returns {{geometry: THREE.BufferGeometry, arms: Array<{geometry: THREE.BufferGeometry, points: THREE.Vector3[], metrics: object, armIndex: number}>}}
 */
// ---------------------------------------------------------------------
// SOLID star: one smoothly-fused sheet instead of 5 overlapping slabs.
//
// The 5 arms + hub are expressed as a single signed-distance field in the
// face's 2D (u, w) plane - per-arm distance-to-centerline minus the local
// taper half-width, smooth-min'd BETWEEN arms (and the hub disc) so the
// junctions fillet into each other organically instead of two slabs
// interpenetrating. Marching squares extracts the outline at iso 0, the
// region is triangulated (with holes, if the field encloses any), midpoint-
// subdivided so the interior samples the bulge/twist curvature, and only
// then mapped through the same place() pipeline the slab arms used. UVs
// are the raw (u, w) coordinates in world units, so tiling perforation
// textures keep constant physical scale across the whole star.
//
// The 2D work depends only on params + R_out - identical for all 12 faces -
// so it's split into buildSolidStar2D (run once) and mapSolidStarToFace
// (run per face, cheap).
// ---------------------------------------------------------------------

function smin(a, b, k) {
  const h = Math.min(Math.max(0.5 + 0.5 * (b - a) / k, 0), 1);
  return b + (a - b) * h - k * h * (1 - h);
}

/**
 * @param {object} params same shape params as `buildSpiralStar` plus:
 * @param {number} [params.filletFrac=0.06] smooth-union fillet radius between arms/hub, as a fraction of R_out
 * @param {number} [params.fieldGrid=144] marching-squares grid resolution
 * @param {number} [params.armSamples=48] centerline samples per arm
 * @param {number} [params.subdivisions=2] midpoint-subdivision rounds after triangulation
 * @param {number} R face circumradius (face.R_out - identical for all faces)
 * @returns 2D star mesh: {positions: [x,y,...], indices, boundaryNext: Map, tips2D: [{tip, prev}], R}
 */
export function buildSolidStar2D(params, R) {
  const {
    armCount = 5,
    starRotationDeg = 0,
    turns = 0.1,
    tipScale = 1.05,
    hubRadiusFrac = 0.02,
    bandHalfWidth = 0.25,
    tipWidthFrac = 0.3,
    widthTaperPower = 1,
    filletFrac = 0.06,
    capRadiusFrac,
    fieldGrid = 144,
    armSamples = 48,
    subdivisions = 2,
  } = params;

  const rot = THREE.MathUtils.degToRad(starRotationDeg);
  const r0 = R * tipScale;
  const hubRadius = R * hubRadiusFrac;
  const spiralThetaMax = turns * Math.PI * 2;
  const kSpiral = Math.log(r0 / hubRadius) / spiralThetaMax;
  const bandHW = R * bandHalfWidth;
  const fillet = Math.max(R * filletFrac, 1e-4);
  const capR = R * (capRadiusFrac ?? Math.max(hubRadiusFrac * 1.5, 0.05));

  // Per-arm centerline polylines + per-sample half-widths (taper measured
  // along arc length from tip toward hub, same as buildSpiralBand).
  const armsData = [];
  const tips2D = [];
  for (let k = 0; k < armCount; k++) {
    const ang0 = (k * Math.PI * 2) / armCount + rot;
    const pts = [];
    for (let i = 0; i <= armSamples; i++) {
      const theta = (spiralThetaMax * i) / armSamples;
      const rr = r0 * Math.exp(-kSpiral * theta);
      const a = ang0 - theta;
      pts.push({ x: rr * Math.cos(a), y: rr * Math.sin(a) });
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = cum[cum.length - 1] || 1;
    const halfW = cum.map((c) =>
      bandHW * THREE.MathUtils.lerp(tipWidthFrac, 1, Math.pow(c / total, widthTaperPower)));
    armsData.push({ pts, halfW });
    tips2D.push({ tip: pts[0], prev: pts[1] });
  }

  const armDist = (arm, px, py) => {
    let d = Infinity;
    const { pts, halfW } = arm;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y;
      const bx = pts[i + 1].x, by = pts[i + 1].y;
      const abx = bx - ax, aby = by - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
      t = Math.min(Math.max(t, 0), 1);
      const dx = px - (ax + abx * t), dy = py - (ay + aby * t);
      const hw = halfW[i] + (halfW[i + 1] - halfW[i]) * t;
      d = Math.min(d, Math.hypot(dx, dy) - hw);
    }
    return d;
  };

  const field = (px, py) => {
    let d = armDist(armsData[0], px, py);
    for (let k = 1; k < armsData.length; k++) d = smin(d, armDist(armsData[k], px, py), fillet);
    return smin(d, Math.hypot(px, py) - capR, fillet);
  };

  // Sample the field on a grid covering the star's maximum possible extent.
  const M = r0 + bandHW * 1.25;
  const G = fieldGrid;
  const coord = (j) => -M + (2 * M * j) / (G - 1);
  const F = new Float64Array(G * G);
  for (let j = 0; j < G; j++) {
    const y = coord(j);
    for (let i = 0; i < G; i++) F[j * G + i] = field(coord(i), y);
  }

  // Marching squares at iso 0 (inside = field < 0). Shared cell edges
  // compute identical crossings, so endpoint keys chain exactly.
  const segs = [];
  const lerpPt = (xa, ya, va, xb, yb, vb) => {
    const t = va / (va - vb);
    return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t };
  };
  for (let j = 0; j < G - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const x0 = coord(i), x1 = coord(i + 1), y0 = coord(j), y1 = coord(j + 1);
      const v00 = F[j * G + i], v10 = F[j * G + i + 1];
      const v01 = F[(j + 1) * G + i], v11 = F[(j + 1) * G + i + 1];
      let c = 0;
      if (v00 < 0) c |= 1;
      if (v10 < 0) c |= 2;
      if (v11 < 0) c |= 4;
      if (v01 < 0) c |= 8;
      if (c === 0 || c === 15) continue;
      const eB = () => lerpPt(x0, y0, v00, x1, y0, v10); // bottom
      const eR = () => lerpPt(x1, y0, v10, x1, y1, v11); // right
      const eT = () => lerpPt(x0, y1, v01, x1, y1, v11); // top
      const eL = () => lerpPt(x0, y0, v00, x0, y1, v01); // left
      const add = (p, q) => segs.push([p, q]);
      switch (c) {
        case 1: add(eL(), eB()); break;
        case 2: add(eB(), eR()); break;
        case 3: add(eL(), eR()); break;
        case 4: add(eR(), eT()); break;
        case 6: add(eB(), eT()); break;
        case 7: add(eL(), eT()); break;
        case 8: add(eT(), eL()); break;
        case 9: add(eT(), eB()); break;
        case 11: add(eT(), eR()); break;
        case 12: add(eR(), eL()); break;
        case 13: add(eB(), eR()); break;
        case 14: add(eL(), eB()); break;
        case 5: { // saddle: decide by cell-center sample
          if (field((x0 + x1) / 2, (y0 + y1) / 2) < 0) { add(eL(), eT()); add(eR(), eB()); }
          else { add(eL(), eB()); add(eR(), eT()); }
          break;
        }
        case 10: {
          if (field((x0 + x1) / 2, (y0 + y1) / 2) < 0) { add(eB(), eL()); add(eT(), eR()); }
          else { add(eB(), eR()); add(eT(), eL()); }
          break;
        }
      }
    }
  }

  // Chain segments into closed loops by shared endpoints. Orientation-
  // agnostic: segments are indexed by BOTH endpoints and walked whichever
  // way they connect, since the case table above makes no promise about
  // consistent winding direction.
  const key = (p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
  const incident = new Map();
  segs.forEach((s, idx) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!incident.has(k)) incident.set(k, []);
      incident.get(k).push({ idx, e });
    }
  });
  const usedIdx = new Uint8Array(segs.length);
  const loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (usedIdx[s0]) continue;
    usedIdx[s0] = 1;
    const loop = [segs[s0][0]];
    const startKey = key(segs[s0][0]);
    let cur = segs[s0][1];
    for (;;) {
      const ck = key(cur);
      if (ck === startKey) break; // closed the loop
      loop.push(cur);
      const cands = (incident.get(ck) || []).filter((c) => !usedIdx[c.idx]);
      if (!cands.length) break; // open chain (shouldn't happen) - drop below if tiny
      const c = cands[0];
      usedIdx[c.idx] = 1;
      cur = segs[c.idx][c.e === 0 ? 1 : 0];
    }
    if (loop.length >= 6) loops.push(loop);
  }

  // Collapse consecutive duplicate/near-duplicate points (a contour point
  // can land exactly on a grid corner and appear twice); keep everything
  // else - the marching-squares density is what the walls and the
  // triangulation both want, and real simplification (tried first as a
  // greedy per-point collinearity test) quietly collapses smooth curves
  // to almost nothing.
  const eps = M * 1e-6;
  const decimated = loops.map((loop) => {
    const out = [];
    for (const p of loop) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > eps) out.push(p);
    }
    if (out.length > 1) {
      const first = out[0], last = out[out.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) <= eps) out.pop();
    }
    return out;
  }).filter((l) => l.length >= 4);

  const signedArea = (loop) => {
    let a = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  decimated.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const outer = decimated[0];
  const holes = decimated.slice(1).filter((l) => Math.abs(signedArea(l)) > (M * M) * 1e-5);
  if (signedArea(outer) < 0) outer.reverse();
  for (const h of holes) if (signedArea(h) > 0) h.reverse();

  // Triangulate (earcut via ShapeUtils), then midpoint-subdivide so the
  // interior gets enough vertices to follow bulge/twist curvature.
  const outerV = outer.map((p) => new THREE.Vector2(p.x, p.y));
  const holesV = holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y)));
  const tris = THREE.ShapeUtils.triangulateShape(outerV, holesV);

  const positions = [];
  const pushPt = (p) => { positions.push(p.x, p.y); return positions.length / 2 - 1; };
  outer.forEach(pushPt);
  holes.forEach((h) => h.forEach(pushPt));
  let indices = [];
  for (const t of tris) indices.push(t[0], t[1], t[2]);

  // Ordered boundary edges (a -> b following each loop) for wall building,
  // maintained through subdivision.
  let boundaryNext = new Map();
  let base = 0;
  for (const loop of [outer, ...holes]) {
    for (let i = 0; i < loop.length; i++) {
      boundaryNext.set(base + i, base + ((i + 1) % loop.length));
    }
    base += loop.length;
  }

  for (let round = 0; round < subdivisions; round++) {
    const midCache = new Map();
    const newIndices = [];
    const midpoint = (a, b) => {
      const k2 = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (midCache.has(k2)) return midCache.get(k2);
      const idx = positions.length / 2;
      positions.push((positions[a * 2] + positions[b * 2]) / 2, (positions[a * 2 + 1] + positions[b * 2 + 1]) / 2);
      midCache.set(k2, idx);
      return idx;
    };
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    indices = newIndices;
    const newBoundary = new Map();
    for (const [a, b] of boundaryNext) {
      const k2 = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (midCache.has(k2)) {
        const m = midCache.get(k2);
        newBoundary.set(a, m);
        newBoundary.set(m, b);
      } else {
        newBoundary.set(a, b);
      }
    }
    boundaryNext = newBoundary;
  }

  return { positions, indices, boundaryNext, tips2D, R };
}

/**
 * Map a `buildSolidStar2D` result onto one face: top/bottom sheets offset
 * along the local surface normal, side walls around every boundary loop,
 * UV = (u, w) world coordinates. Also returns each arm's world tip
 * position/tangent for building extensions.
 */
export function mapSolidStarToFace(star2D, face, params = {}) {
  const {
    thickness = 0.015,
    bulgeStrength = 0,
    tipDipStrength = 0,
    surfTwistDeg = 0,
  } = params;

  const R = star2D.R;
  const surfTwistRad = THREE.MathUtils.degToRad(surfTwistDeg);
  const halfT = (R * thickness) / 2;

  const place = (u, w) => {
    const r = Math.hypot(u, w);
    const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(r / R, 2)) : 0;
    const world = face.center.clone().add(applySurfaceTwist(face, u, w, bulge, surfTwistRad));
    applyTipDip(world, r, face, tipDipStrength);
    return world;
  };

  const n2 = star2D.positions.length / 2;
  const eps = R * 1e-3;
  const worldPts = new Array(n2);
  const normals = new Array(n2);
  for (let i = 0; i < n2; i++) {
    const u = star2D.positions[i * 2], w = star2D.positions[i * 2 + 1];
    worldPts[i] = place(u, w);
    const pu = place(u + eps, w).sub(place(u - eps, w));
    const pw = place(u, w + eps).sub(place(u, w - eps));
    const n = new THREE.Vector3().crossVectors(pu, pw).normalize();
    if (n.dot(face.normal) < 0) n.negate();
    normals[i] = n;
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const pushVert = (p, u, v) => { positions.push(p.x, p.y, p.z); uvs.push(u, v); };

  // Top sheet (2D triangulation is CCW seen from +normal side).
  for (let i = 0; i < n2; i++) {
    pushVert(worldPts[i].clone().addScaledVector(normals[i], halfT), star2D.positions[i * 2], star2D.positions[i * 2 + 1]);
  }
  for (let t = 0; t < star2D.indices.length; t += 3) {
    indices.push(star2D.indices[t], star2D.indices[t + 1], star2D.indices[t + 2]);
  }
  // Bottom sheet, reversed winding.
  const botBase = n2;
  for (let i = 0; i < n2; i++) {
    pushVert(worldPts[i].clone().addScaledVector(normals[i], -halfT), star2D.positions[i * 2], star2D.positions[i * 2 + 1]);
  }
  for (let t = 0; t < star2D.indices.length; t += 3) {
    indices.push(botBase + star2D.indices[t], botBase + star2D.indices[t + 2], botBase + star2D.indices[t + 1]);
  }
  // Side walls along every boundary loop (crisp edges via fresh vertices).
  let arc = 0;
  for (const [a, b] of star2D.boundaryNext) {
    const ta = worldPts[a].clone().addScaledVector(normals[a], halfT);
    const ba = worldPts[a].clone().addScaledVector(normals[a], -halfT);
    const tb = worldPts[b].clone().addScaledVector(normals[b], halfT);
    const bb = worldPts[b].clone().addScaledVector(normals[b], -halfT);
    const vbase = positions.length / 3;
    const seg = ta.distanceTo(tb);
    pushVert(ta, arc, 0);
    pushVert(ba, arc, halfT * 2);
    pushVert(tb, arc + seg, 0);
    pushVert(bb, arc + seg, halfT * 2);
    indices.push(vbase, vbase + 2, vbase + 1, vbase + 1, vbase + 2, vbase + 3);
    arc += seg;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const arms = star2D.tips2D.map(({ tip, prev }, armIndex) => {
    const tipPos = place(tip.x, tip.y);
    const tangent = tipPos.clone().sub(place(prev.x, prev.y)).normalize();
    return { armIndex, tipPosition: tipPos, tipTangent: tangent };
  });

  return { geometry, arms };
}

/**
 * A connector that CONTINUES an arm rather than reading as a separate
 * ribbon: a Hermite curve from arm A's tip (leaving along A's own outward
 * tangent) to arm B's tip (arriving against B's outward tangent), extruded
 * with the arms' own tip cross-section (constant width/thickness, major
 * axis = cross(tangent, sphere-radial) like everything else here), rolled
 * gradually about its own axis by `twistDeg` (counter-clockwise positive;
 * 180 lands flat-to-flat again at the far end), and pulled inward mid-span
 * (`depthFraction`) so it passes UNDER whatever it crosses.
 */
export function buildArmExtension(tipA, tipB, options = {}) {
  const {
    halfWidth = 0.05,
    halfThickness = 0.01,
    lengthFactor = 0.62,
    twistDeg = 180,
    depthFraction = 0.92,
    segments = 40,
  } = options;

  const P0 = tipA.tipPosition.clone();
  const P1 = tipB.tipPosition.clone();
  const span = P0.distanceTo(P1);
  const m0 = tipA.tipTangent.clone().multiplyScalar(span * lengthFactor);
  const m1 = tipB.tipTangent.clone().multiplyScalar(-span * lengthFactor);

  const hermite = (t) => {
    const t2 = t * t, t3 = t2 * t;
    return new THREE.Vector3()
      .addScaledVector(P0, 2 * t3 - 3 * t2 + 1)
      .addScaledVector(m0, t3 - 2 * t2 + t)
      .addScaledVector(P1, -2 * t3 + 3 * t2)
      .addScaledVector(m1, t3 - t2);
  };
  const pointAt = (t) => {
    const p = hermite(t);
    const baseR = THREE.MathUtils.lerp(P0.length(), P1.length(), t);
    const target = baseR * THREE.MathUtils.lerp(1, depthFraction, Math.sin(Math.PI * t));
    const len = p.length();
    if (len > 1e-9) p.multiplyScalar(target / len);
    return p;
  };

  const twistRad = THREE.MathUtils.degToRad(twistDeg);
  const stations = [];
  let arc = 0;
  let prevPt = null;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = pointAt(t);
    const tangent = pointAt(Math.min(t + 1e-3, 1)).sub(pointAt(Math.max(t - 1e-3, 0))).normalize();
    const radial = p.clone().normalize();
    let major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) major.set(1, 0, 0);
    major.normalize();
    let minor = new THREE.Vector3().crossVectors(tangent, major).normalize();
    const phi = twistRad * t;
    const c = Math.cos(phi), s = Math.sin(phi);
    const majorR = major.clone().multiplyScalar(c).addScaledVector(minor, s);
    const minorR = new THREE.Vector3().crossVectors(tangent, majorR).normalize();
    if (prevPt) arc += p.distanceTo(prevPt);
    prevPt = p;
    stations.push({
      topA: p.clone().addScaledVector(majorR, halfWidth).addScaledVector(minorR, halfThickness),
      topB: p.clone().addScaledVector(majorR, -halfWidth).addScaledVector(minorR, halfThickness),
      botA: p.clone().addScaledVector(majorR, halfWidth).addScaledVector(minorR, -halfThickness),
      botB: p.clone().addScaledVector(majorR, -halfWidth).addScaledVector(minorR, -halfThickness),
      arc,
    });
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const addStrip = (vertPair, vPair) => {
    const vbase = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const s2 = stations[i];
      const [va, vb] = vertPair(s2);
      positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      uvs.push(s2.arc, vPair[0], s2.arc, vPair[1]);
    }
    for (let i = 0; i < segments; i++) {
      const a = vbase + i * 2, b = a + 1, c2 = vbase + (i + 1) * 2, d = c2 + 1;
      indices.push(a, c2, b, b, c2, d);
    }
  };
  addStrip((s2) => [s2.topA, s2.topB], [halfWidth, -halfWidth]);
  addStrip((s2) => [s2.botB, s2.botA], [-halfWidth, halfWidth]);
  addStrip((s2) => [s2.topA, s2.botA], [0, halfThickness]);
  addStrip((s2) => [s2.botB, s2.topB], [0, halfThickness]);

  const pushCap = (station, flip) => {
    const vbase = positions.length / 3;
    const verts = [station.topA, station.topB, station.botB, station.botA];
    for (const v of verts) { positions.push(v.x, v.y, v.z); uvs.push(0, 0); }
    if (!flip) indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
    else indices.push(vbase, vbase + 2, vbase + 1, vbase, vbase + 3, vbase + 2);
  };
  pushCap(stations[0], false);
  pushCap(stations[segments], true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry };
}

export function buildSpiralStar(face, params = {}) {
  const { armCount = 5, capRadiusFrac, starRotationDeg = 0, ...armParams } = params;
  const starRotationRad = THREE.MathUtils.degToRad(starRotationDeg);

  const arms = [];
  const positions = [];
  const indices = [];
  let vOffset = 0;

  const addGeometry = (geom) => {
    const pos = geom.attributes.position.array;
    for (let j = 0; j < pos.length; j++) positions.push(pos[j]);
    const idx = geom.index.array;
    for (let j = 0; j < idx.length; j++) indices.push(idx[j] + vOffset);
    vOffset += pos.length / 3;
  };

  for (let i = 0; i < armCount; i++) {
    const angleOffset = (i * Math.PI * 2) / armCount + starRotationRad;
    const arm = buildSpiralBand(face, { ...armParams, angleOffset });
    arms.push({ ...arm, armIndex: i });
    addGeometry(arm.geometry);
  }

  const hubRadiusFrac = armParams.hubRadiusFrac ?? 0.16;
  const hubCap = buildHubCap(face, {
    capRadiusFrac: capRadiusFrac ?? hubRadiusFrac * 1.5,
    thickness: armParams.thickness,
    bulgeStrength: armParams.bulgeStrength,
  });
  addGeometry(hubCap);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { geometry, arms };
}
