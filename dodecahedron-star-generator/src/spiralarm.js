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
 * @param {number} [params.subdivisions=3] midpoint-subdivision rounds after triangulation - earcut triangulates using ONLY boundary points (no interior Steiner points), so its interior triangles fanning across open areas are large/flat; each round quarters them. Cheap in isolation (this whole function runs once, shared across all faces) but the resulting vertex count is what mapSolidStarToFace pays 12x for, so this is the main perf/smoothness dial
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
    subdivisions = 3,
    // Snap-joint sockets ("Stardream - 3D Printing" preset): a real
    // through-hole cut into each arm tip (not the alphaMap-texture
    // perforation elsewhere in the app, an actual boundary loop in the
    // field), sized for a peg pushed through the thin printed sheet.
    // Placed `snapHoleInsetFrac * R` in from the tip along the arm's own
    // centerline, not AT the tip point itself, so the hole's full
    // circumference lands in solid material instead of notching the tip.
    snapEnabled = false,
    snapHoleRadiusFrac = 0.05,
    snapHoleInsetFrac = 0.11,
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
    tips2D.push({ tip: pts[0], prev: pts[1], prev2: pts[2] });
  }

  // Snap-hole center: walk the arm's own centerline (arc length, same
  // `cum` measure the width taper uses) out from the tip until it first
  // clears `snapHoleInsetFrac * R`, then linearly interpolate the exact
  // point on that segment - keeps the hole ON the centerline (so it's
  // centered in the tip's width) rather than at a fixed sample index,
  // which would drift with `armSamples`.
  const snapHoleCenters2D = [];
  if (snapEnabled) {
    const holeR = R * snapHoleRadiusFrac;
    const inset = R * snapHoleInsetFrac;
    for (const { pts } of armsData) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      let center = pts[pts.length - 1];
      for (let i = 1; i < pts.length; i++) {
        if (cum[i] >= inset) {
          const segFrac = (inset - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
          center = {
            x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * segFrac,
            y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * segFrac,
          };
          break;
        }
      }
      snapHoleCenters2D.push({ ...center, radius: holeR });
    }
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
    d = smin(d, Math.hypot(px, py) - capR, fillet);
    // Subtract each snap hole (standard SDF subtraction: max(d, -hole(p))) -
    // a plain max, not smin, so the hole's edge stays a crisp circle for a
    // peg to seat against rather than blending into the surrounding taper.
    for (const h of snapHoleCenters2D) {
      d = Math.max(d, h.radius - Math.hypot(px - h.x, py - h.y));
    }
    return d;
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

  // Raw per-arm centerline polylines (2D, tip-first: index 0 = tip, last =
  // hub), kept alongside the triangulated field so callers that need the
  // arm's actual path rather than just its tip - the flyover camera, in
  // particular - can map every sample through the same place()-equivalent
  // pipeline the rendered sheet uses (see mapArmCenterline below).
  const armPolylines2D = armsData.map((a) => a.pts);

  return { positions, indices, boundaryNext, tips2D, armPolylines2D, snapHoleCenters2D, R };
}

/**
 * Extra, steep (exponential) rotation applied to a point's (u, w) BEFORE
 * the rest of the surface pipeline, growing sharply only in the last
 * stretch before an arm's tip (`tipScale * R`) - `tipBendPower` high (5-8)
 * keeps it near zero until r/r0 is close to 1, then ramps up fast. This is
 * the "twist" half of the tip bend: without it, an arm's plane meets its
 * extension at close to a right angle, because nothing about the star
 * surface itself leans toward the extension's incoming direction until
 * the very last moment.
 */
function tipBendRotate(u, w, r, R, params) {
  const { tipScale = 1, tipBendPower = 5, tipBendTwistDeg = 0 } = params;
  if (!tipBendTwistDeg || r < 1e-9) return { u, w };
  const r0 = R * tipScale;
  const tNear = Math.min(Math.max(r / r0, 0), 1);
  const bend = Math.pow(tNear, tipBendPower);
  const extra = THREE.MathUtils.degToRad(tipBendTwistDeg) * bend;
  const c = Math.cos(extra), s = Math.sin(extra);
  return { u: u * c - w * s, w: u * s + w * c };
}

/**
 * UV coordinate for a rendered star-surface point: the SAME (u, w) after
 * `tipBendRotate` has already spun it, rather than the raw pre-rotation grid
 * coordinate `mapSolidStarToFace`/`buildStarRim` used to push as UV. The
 * rotation grows steeply (`tipBendPower`) only in the last stretch before a
 * tip, so two points close together in raw (u, w) but at slightly different
 * radii can end up rotated by noticeably different amounts - pulling them
 * apart in world space faster than their raw-UV distance implies. Sampling
 * the texture with the raw coordinate then reads as the hex pattern
 * shearing/stretching in exactly that last stretch (reported as the surface
 * near the tips feeling "stretched"). Using the already-rotated coordinate
 * as the UV instead keeps UV distance and in-plane world distance in step
 * through the rotation, so the pattern tiles uniformly across it; the dip
 * and bulge are left alone since neither is a spatially-varying in-plane
 * rotation and so neither shears the pattern the same way.
 */
function bentUV(u, w, R, params) {
  return tipBendRotate(u, w, Math.hypot(u, w), R, params);
}

/**
 * The "dip" half of the tip bend: an extra inward pull (toward the sphere
 * center), same steep exponential onset as `tipBendRotate`, layered ON TOP
 * of the existing (much gentler, power-1.6) `applyTipDip`. Together the
 * two make the star surface curve away from the tangent plane increasingly
 * sharply in just the last stretch before the tip, so its local slope
 * already roughly matches the extension's incoming slope by the time they
 * meet - the "as the arm approaches the tip it bends down with higher and
 * higher angles" the user asked for.
 */
function tipBendDip(r, R, params) {
  const { tipScale = 1, tipBendStrength = 0, tipBendPower = 5 } = params;
  if (!tipBendStrength) return 0;
  const r0 = R * tipScale;
  const tNear = Math.min(Math.max(r / r0, 0), 1);
  return tipBendStrength * R * Math.pow(tNear, tipBendPower);
}

/**
 * The shared point-mapping pipeline every rendered surface in this module
 * uses (star sheet, rim, and now the flyover camera path): a local (u, w)
 * coordinate in a face's tangent plane, run through the exponential tip
 * bend, surface twist/bulge, and tip dip, in that order. Factored out once
 * here (previously duplicated inside `mapSolidStarToFace` and
 * `buildStarRim`) so anything that needs to sample an arbitrary point on
 * the star's surface - not just its boundary or its tip - uses exactly the
 * same math the rendered mesh does.
 */
export function mapStarPoint(u, w, R, face, params = {}) {
  const { bulgeStrength = 0, tipDipStrength = 0, surfTwistDeg = 0 } = params;
  const surfTwistRad = THREE.MathUtils.degToRad(surfTwistDeg);
  const r = Math.hypot(u, w);
  const rot = tipBendRotate(u, w, r, R, params);
  const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(r / R, 2)) : 0;
  const world = face.center.clone().add(applySurfaceTwist(face, rot.u, rot.w, bulge, surfTwistRad));
  applyTipDip(world, r, face, tipDipStrength);
  const dip = tipBendDip(r, R, params);
  if (dip) world.addScaledVector(world.clone().normalize(), -dip);
  return world;
}

/**
 * Map one arm's raw 2D centerline (from `buildSolidStar2D`'s
 * `armPolylines2D`, tip-first) onto a face through `mapStarPoint`, so the
 * result tracks the actual rendered arm surface (bulge/twist/tip-bend and
 * all) rather than the flat spiral the 2D field started from. Used by the
 * flyover camera path to fly "along" an arm rather than in a straight line
 * between its tip and hub.
 *
 * @param {number} [inset=0] pulls each point toward the sphere center by
 *   this fraction of R - flying exactly ON the surface looks like clipping
 *   through the mesh from a first-person camera; a small inset keeps the
 *   path just under it.
 * @returns {THREE.Vector3[]} tip-first world-space points
 */
export function mapArmCenterline(star2D, face, armIndex, params = {}, inset = 0) {
  const pts2D = star2D.armPolylines2D[armIndex];
  return pts2D.map(({ x, y }) => {
    const p = mapStarPoint(x, y, star2D.R, face, params);
    if (inset) p.addScaledVector(p.clone().normalize(), -inset * star2D.R);
    return p;
  });
}

/**
 * Like `mapArmCenterline`, but also returns the TRUE local surface normal
 * at every sample (finite difference in (u, w) - the same technique
 * `mapSolidStarToFace` uses for its own vertex normals), instead of just
 * the sphere-radial direction. Near a tip, where the exponential tip-bend
 * (`tipBendRotate`/`tipBendDip`) curls the surface sharply, the true
 * normal diverges from radial by up to ~27 degrees (measured) - enough
 * that hovering "outward" along the radial direction can still land the
 * camera on the wrong side of (or clipping through) the actual curled
 * surface right where the arm meets its horn-triangle tip. Hovering along
 * the true normal instead keeps a flyover camera genuinely above the
 * external surface everywhere along the arm, tip included.
 * @returns {{point: THREE.Vector3, normal: THREE.Vector3}[]} tip-first
 */
export function mapArmCenterlineWithNormal(star2D, face, armIndex, params = {}) {
  const pts2D = star2D.armPolylines2D[armIndex];
  const R = star2D.R;
  const eps = R * 1e-3;
  return pts2D.map(({ x, y }) => {
    const p0 = mapStarPoint(x, y, R, face, params);
    const pu = mapStarPoint(x + eps, y, R, face, params).sub(mapStarPoint(x - eps, y, R, face, params));
    const pw = mapStarPoint(x, y + eps, R, face, params).sub(mapStarPoint(x, y - eps, R, face, params));
    const normal = new THREE.Vector3().crossVectors(pu, pw);
    if (normal.lengthSq() < 1e-16) normal.copy(p0).normalize();
    else normal.normalize();
    if (normal.dot(face.normal) < 0) normal.negate();
    return { point: p0, normal };
  });
}

/**
 * Map a `buildSolidStar2D` result onto one face: top/bottom sheets offset
 * along the local surface normal, side walls around every boundary loop,
 * UV = (u, w) world coordinates. Also returns each arm's world tip
 * position/tangent for building extensions.
 */
/**
 * Drops triangles from a (positions, indices) mesh whose centroid lies
 * beyond a cutting plane, gated to just the region within `gateRadius` of
 * `gateCenter` - so the (infinite) plane test never touches unrelated
 * geometry elsewhere in the same combined buffer (the hub, other arms)
 * even when it would technically fall on the "cut" side of the plane.
 * Used to stop the star's own arm surface from being drawn where a
 * `spiralRibbon` connector has already taken over that same span.
 */
function trimTrianglesPastPlane(positions, indices, planePoint, planeNormal, gateCenter, gateRadius) {
  const vCount = positions.length / 3;
  const gateRadiusSq = gateRadius * gateRadius;
  const keep = new Uint8Array(vCount);
  const v = new THREE.Vector3();
  const rel = new THREE.Vector3();
  for (let i = 0; i < vCount; i++) {
    v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    if (v.distanceToSquared(gateCenter) > gateRadiusSq) { keep[i] = 1; continue; }
    rel.copy(v).sub(planePoint);
    keep[i] = rel.dot(planeNormal) <= 0 ? 1 : 0;
  }
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (keep[a] && keep[b] && keep[c]) out.push(a, b, c);
  }
  return out;
}

/**
 * @param {Array<{point: THREE.Vector3, normal: THREE.Vector3, gateCenter: THREE.Vector3, gateRadius: number}|null>} [armTrims]
 *   Per-arm (indexed by armIndex) cut plane - vertices past `point` along
 *   `normal`, within `gateRadius` of `gateCenter`, are dropped. Used by the
 *   `spiralRibbon` connector style so the star's own arm surface stops
 *   where the connector's own geometry has already taken over that span
 *   (reported as visible gaps/mismatch between the two overlapping,
 *   non-identical surfaces otherwise).
 */
export function mapSolidStarToFace(star2D, face, params = {}, armTrims = null) {
  const { thickness = 0.015 } = params;

  const R = star2D.R;
  const halfT = (R * thickness) / 2;
  const place = (u, w) => mapStarPoint(u, w, R, face, params);

  const n2 = star2D.positions.length / 2;
  const eps = R * 1e-3;
  const worldPts = new Array(n2);
  const normals = new Array(n2);
  const uvPts = new Array(n2);
  for (let i = 0; i < n2; i++) {
    const u = star2D.positions[i * 2], w = star2D.positions[i * 2 + 1];
    worldPts[i] = place(u, w);
    const pu = place(u + eps, w).sub(place(u - eps, w));
    const pw = place(u, w + eps).sub(place(u, w - eps));
    const n = new THREE.Vector3().crossVectors(pu, pw).normalize();
    if (n.dot(face.normal) < 0) n.negate();
    normals[i] = n;
    uvPts[i] = bentUV(u, w, R, params);
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const pushVert = (p, u, v) => { positions.push(p.x, p.y, p.z); uvs.push(u, v); };

  // Top sheet (2D triangulation is CCW seen from +normal side).
  for (let i = 0; i < n2; i++) {
    pushVert(worldPts[i].clone().addScaledVector(normals[i], halfT), uvPts[i].u, uvPts[i].w);
  }
  for (let t = 0; t < star2D.indices.length; t += 3) {
    indices.push(star2D.indices[t], star2D.indices[t + 1], star2D.indices[t + 2]);
  }
  // Bottom sheet, reversed winding.
  const botBase = n2;
  for (let i = 0; i < n2; i++) {
    pushVert(worldPts[i].clone().addScaledVector(normals[i], -halfT), uvPts[i].u, uvPts[i].w);
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

  let finalIndices = indices;
  if (armTrims) {
    for (const trim of armTrims) {
      if (!trim) continue;
      finalIndices = trimTrianglesPastPlane(positions, finalIndices, trim.point, trim.normal, trim.gateCenter, trim.gateRadius);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(finalIndices);
  geometry.computeVertexNormals();

  const arms = computeArmTips(star2D, face, params);

  return { geometry, arms };
}

/**
 * Just the per-arm tip position/tangent/curvature `mapSolidStarToFace`
 * returns alongside its geometry - factored out so callers that only need
 * tip data (single-face print mode's hidden faces, which still need their
 * tips for the snap-hub pieces and connectors but not their full mesh) can
 * skip the expensive top/bottom-sheet + wall vertex construction entirely.
 * @returns {{armIndex: number, tipPosition: THREE.Vector3, tipTangent: THREE.Vector3, tipNormal: THREE.Vector3, tipCurvature: THREE.Vector3}[]}
 */
export function computeArmTips(star2D, face, params = {}) {
  const R = star2D.R;
  const place = (u, w) => mapStarPoint(u, w, R, face, params);
  const eps = R * 1e-3;
  return star2D.tips2D.map(({ tip, prev, prev2 }, armIndex) => {
    const p0 = place(tip.x, tip.y);
    const p1 = place(prev.x, prev.y);
    const p2 = place(prev2.x, prev2.y);
    const tangent = p0.clone().sub(p1).normalize();
    // TRUE local surface normal at the tip (same finite-difference
    // cross-product `mapArmCenterlineWithNormal` uses for the rest of the
    // arm), not a sphere-radial approximation - measured up to ~27 degrees
    // apart right where the exponential tip-bend curls the surface near a
    // tip (the same mismatch already documented/fixed for the flyover
    // camera's hover offset). A connector frame built off the wrong "up"
    // here shows up as a visible kink/wedge exactly where it meets the
    // arm ("ear lobe").
    const pu = place(tip.x + eps, tip.y).sub(place(tip.x - eps, tip.y));
    const pw = place(tip.x, tip.y + eps).sub(place(tip.x, tip.y - eps));
    const tipNormal = new THREE.Vector3().crossVectors(pu, pw);
    if (tipNormal.lengthSq() < 1e-16) tipNormal.copy(p0).normalize();
    else tipNormal.normalize();
    if (tipNormal.dot(face.normal) < 0) tipNormal.negate();
    // Discrete curvature at the tip - circumcircle of the first three
    // centerline samples, with the curvature normal taken from the second
    // difference (tangential component removed). Measured in WORLD space
    // through place(), so it includes every distortion the surface pipeline
    // applies (bulge, twist, tip dip, exponential tip bend) - this is what
    // lets a connector continue not just the arm's direction but its
    // curvature (see buildHornArc's clothoid fitting).
    const la = p0.distanceTo(p1), lb = p1.distanceTo(p2), lc = p0.distanceTo(p2);
    const areaVec = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
    const area = areaVec.length() / 2;
    const tipCurvature = new THREE.Vector3();
    if (area > 1e-12 && la * lb * lc > 1e-18) {
      const kappa = (4 * area) / (la * lb * lc);
      const second = p2.clone().addScaledVector(p1, -2).add(p0);
      second.addScaledVector(tangent, -second.dot(tangent));
      if (second.lengthSq() > 1e-18) tipCurvature.copy(second.normalize().multiplyScalar(kappa));
    }
    // World position of this arm's snap-hole socket (if any) - the hub
    // piece's pegs need to aim at THIS, not at the raw tip point: the hole
    // sits inset along the arm's own (possibly bent/twisted) centerline,
    // not on the straight line from a horn-triangle center to the tip, so
    // a peg aimed at `tipPosition` generally misses it.
    const hole2D = star2D.snapHoleCenters2D && star2D.snapHoleCenters2D[armIndex];
    const snapHolePosition = hole2D ? place(hole2D.x, hole2D.y) : null;
    return { armIndex, tipPosition: p0, tipTangent: tangent, tipNormal, tipCurvature, snapHolePosition };
  });
}

/**
 * The hub-side counterpart to `computeArmTips`: same shape
 * ({tipPosition, tipTangent, tipNormal, armIndex}), but anchored at the
 * FAR end of each arm's centerline (`armPolylines2D`'s last sample, right
 * at the hub near the face center) instead of the near-rim tip. Currently
 * used only by the debug-mode markers in `spiral-dodeca-main.js`
 * (`buildHubRectDebug` below) to show where a hub-anchored connector would
 * actually start. `tipTangent` points OUTWARD from the hub (toward that
 * arm's own tip), matching `computeArmTips`' own "tangent points away from
 * the center" convention at the opposite end.
 * @returns {{armIndex: number, tipPosition: THREE.Vector3, tipTangent: THREE.Vector3, tipNormal: THREE.Vector3}[]}
 */
export function computeHubAnchors(star2D, face, params = {}) {
  const R = star2D.R;
  const place = (u, w) => mapStarPoint(u, w, R, face, params);
  const eps = R * 1e-3;
  return star2D.armPolylines2D.map((pts, armIndex) => {
    const n = pts.length;
    const hub2D = pts[n - 1];
    const prev2D = pts[n - 2];
    const p0 = place(hub2D.x, hub2D.y);
    const p1 = place(prev2D.x, prev2D.y);
    const tangent = p1.clone().sub(p0).normalize();
    const pu = place(hub2D.x + eps, hub2D.y).sub(place(hub2D.x - eps, hub2D.y));
    const pw = place(hub2D.x, hub2D.y + eps).sub(place(hub2D.x, hub2D.y - eps));
    const tipNormal = new THREE.Vector3().crossVectors(pu, pw);
    if (tipNormal.lengthSq() < 1e-16) tipNormal.copy(p0).normalize();
    else tipNormal.normalize();
    if (tipNormal.dot(face.normal) < 0) tipNormal.negate();
    return { armIndex, tipPosition: p0, tipTangent: tangent, tipNormal };
  });
}

/**
 * The real (non-debug) counterpart to `buildHubEdgeRectDebug`'s outline -
 * one per arm (`armIndex` = the arm the edge STARTS at, bridging to
 * `(armIndex + 1) % armCount`), giving the midpoint and full width of the
 * "orange" bridge between two consecutive arms' hub rectangles (same
 * far-from-rim short-side selection that function's own doc explains).
 * Used by `buildRectangleConnectorGroup` as the WIDE end of its taper -
 * `width` here is the actual bridge span (typically much wider than the
 * "lime" tristar touching-point's own render width), not a single short
 * edge's own thickness.
 * @returns {{armIndex: number, tipPosition: THREE.Vector3, tipNormal: THREE.Vector3, width: number, thickness: number}[]}
 */
export function computeHubEdgeAnchors(star2D, face, params = {}) {
  const { R = 1, bandHalfWidth = 0.22, thickness: armThicknessFrac = 0.015 } = params;
  const halfW = R * bandHalfWidth;
  const thick = R * armThicknessFrac;
  const hubAnchors = computeHubAnchors(star2D, face, params);
  const tips = computeArmTips(star2D, face, params);

  const farSide = (anchor, tip) => {
    const tangent = anchor.tipTangent;
    const radial = anchor.tipNormal;
    const major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) {
      major.set(Math.abs(tangent.x) < 0.9 ? 1 : 0, Math.abs(tangent.x) < 0.9 ? 0 : 1, 0);
      major.addScaledVector(tangent, -major.dot(tangent));
    }
    major.normalize();
    const plus = anchor.tipPosition.clone().addScaledVector(major, halfW);
    const minus = anchor.tipPosition.clone().addScaledVector(major, -halfW);
    return plus.distanceToSquared(tip.tipPosition) >= minus.distanceToSquared(tip.tipPosition) ? plus : minus;
  };

  return hubAnchors.map((anchor, i) => {
    const next = hubAnchors[(i + 1) % hubAnchors.length];
    const a = farSide(anchor, tips[i]);
    const b = farSide(next, tips[(i + 1) % tips.length]);
    const position = a.clone().add(b).multiplyScalar(0.5);
    return {
      armIndex: i,
      tipPosition: position,
      tipNormal: position.clone().normalize(),
      width: a.distanceTo(b),
      thickness: thick,
    };
  });
}

/**
 * A raised bead tracing every boundary loop of the solid star (outer
 * silhouette AND every gap/hole edge) - the smooth-shaded field-based sheet
 * on its own reads as a flat cutout; a defined rim/bezel along every edge
 * is what the earlier Quin raymarched study's RIM_W/RIM_PROUD gave it.
 *
 * Cross-section per boundary point: height 0 at the true edge, rising to
 * `rimProudFrac * R` at `rimWidthFrac * R` inward, back to flush with the
 * sheet beyond that (`sin(pi * s)` profile) - a rounded bead sitting proud
 * of the surface, not a hard step. The inward 2D direction at each
 * boundary point comes from the triangulation itself (the third vertex of
 * whichever triangle owns that edge tells us which side has material) so
 * it's correct regardless of how convex/concave the local boundary is.
 *
 * @param {ReturnType<typeof buildSolidStar2D>} star2D
 * @param {Face} face
 * @param {object} [params] same thickness/bulge/twist params as `mapSolidStarToFace`, plus:
 * @param {number} [params.rimWidthFrac=0.02] rim width, fraction of R_out
 * @param {number} [params.rimProudFrac=0.025] how far the rim's peak stands proud of the sheet, fraction of R_out
 * @param {number} [params.rimCrossSamples=4] cross-section resolution
 * @param {Array<{point: THREE.Vector3, normal: THREE.Vector3, gateCenter: THREE.Vector3, gateRadius: number}|null>} [armTrims]
 *   Same per-arm cut planes `mapSolidStarToFace` takes - the rim traces
 *   every boundary loop independently of the main sheet, so trimming the
 *   sheet alone left the rim's own bead still running out to the untouched
 *   true tip: a thin ring/arc floating past the now-shorter sheet with
 *   nothing behind it (reported as "a circular arm left of the ear lobe").
 * @returns {THREE.BufferGeometry}
 */
export function buildStarRim(star2D, face, params = {}, armTrims = null) {
  const {
    thickness = 0.015,
    rimWidthFrac = 0.02,
    rimProudFrac = 0.025,
    rimCrossSamples = 4,
  } = params;

  const R = star2D.R;
  const halfT = (R * thickness) / 2;
  const rimWidth = R * rimWidthFrac;
  const rimProud = R * rimProudFrac;
  const eps = R * 1e-3;

  const place = (u, w) => mapStarPoint(u, w, R, face, params);

  const idx = star2D.indices;
  const edgeThird = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeThird.has(key)) edgeThird.set(key, c);
    }
  }
  const pos2 = star2D.positions;
  const inward = new Map();
  for (const [a, b] of star2D.boundaryNext) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const c = edgeThird.get(key);
    if (c === undefined) continue;
    const ax = pos2[a * 2], ay = pos2[a * 2 + 1];
    const bx = pos2[b * 2], by = pos2[b * 2 + 1];
    const cx = pos2[c * 2], cy = pos2[c * 2 + 1];
    const ex = bx - ax, ey = by - ay;
    const elen = Math.hypot(ex, ey) || 1;
    let nx = -ey / elen, ny = ex / elen;
    if ((cx - ax) * nx + (cy - ay) * ny < 0) { nx = -nx; ny = -ny; }
    for (const p of [a, b]) {
      if (!inward.has(p)) inward.set(p, { x: 0, y: 0 });
      const v = inward.get(p);
      v.x += nx;
      v.y += ny;
    }
  }
  for (const v of inward.values()) {
    const len = Math.hypot(v.x, v.y) || 1;
    v.x /= len;
    v.y /= len;
  }

  const csCache = new Map();
  const crossSection = (i) => {
    if (csCache.has(i)) return csCache.get(i);
    const u = pos2[i * 2], w = pos2[i * 2 + 1];
    const dir = inward.get(i) || { x: 0, y: 0 };
    const n = new THREE.Vector3()
      .crossVectors(
        place(u + eps, w).sub(place(u - eps, w)),
        place(u, w + eps).sub(place(u, w - eps))
      )
      .normalize();
    if (n.dot(face.normal) < 0) n.negate();
    const stations = [];
    for (let k = 0; k <= rimCrossSamples; k++) {
      const s = k / rimCrossSamples;
      const uu = u + dir.x * rimWidth * s;
      const ww = w + dir.y * rimWidth * s;
      const proud = halfT + rimProud * Math.sin(Math.PI * s);
      stations.push(place(uu, ww).addScaledVector(n, proud));
    }
    csCache.set(i, stations);
    return stations;
  };

  const positions = [];
  const uvs = [];
  const indices = [];
  // UV = the actual (u, w) world-unit coordinate each rim vertex sits at
  // (not the cross-section's own s/height), matching mapSolidStarToFace's
  // convention exactly so the shared material's tiling perforation pattern
  // continues seamlessly from the sheet onto the rim. Without this the
  // geometry has no UV attribute at all - the alphaMap then samples
  // undefined/(0,0) for every fragment, which alphaTest discards as a
  // "hole" everywhere, making the whole rim invisible regardless of any
  // pattern/hole-size setting (the bug behind "rim doesn't show up").
  const pushVert = (p, u, w) => { positions.push(p.x, p.y, p.z); uvs.push(u, w); };

  for (const [a, b] of star2D.boundaryNext) {
    const csA = crossSection(a);
    const csB = crossSection(b);
    const uvA = bentUV(pos2[a * 2], pos2[a * 2 + 1], R, params);
    const uvB = bentUV(pos2[b * 2], pos2[b * 2 + 1], R, params);
    for (let k = 0; k < rimCrossSamples; k++) {
      const base = positions.length / 3;
      pushVert(csA[k], uvA.u, uvA.w);
      pushVert(csA[k + 1], uvA.u, uvA.w);
      pushVert(csB[k], uvB.u, uvB.w);
      pushVert(csB[k + 1], uvB.u, uvB.w);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  let finalIndices = indices;
  if (armTrims) {
    for (const trim of armTrims) {
      if (!trim) continue;
      finalIndices = trimTrianglesPastPlane(positions, finalIndices, trim.point, trim.normal, trim.gateCenter, trim.gateRadius);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(finalIndices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * "Circular horn triangle" connector. The adjacency rule's 60 pairs chain
 * into exactly 20 closed 3-cycles - one per dodecahedron vertex, where
 * three faces (and so three arm tips) meet. Drawing ONE arc per pair
 * therefore assembles, with no extra bookkeeping, 20 curved triangles
 * whose edges bow like the reference deltoid: each side sweeps from one
 * tip to the next, hugging the silhouette of the star arm it passes.
 *
 * One arc = a Hermite curve whose end tangents are the ARMS' OWN tip
 * tangents: it leaves tip A along A's outward direction and arrives at
 * tip B against B's outward direction. That gives the two properties the
 * shape needs at once - (1) at every tip the two incident arcs and the
 * arm itself all share one tangent line, forming the horn triangle's
 * cusp while staying G1-continuous with the arm surface, and (2) since
 * each neighboring arm's edge leaves its own tip in that same direction,
 * the arc's launch runs parallel to the arm beside it before bending
 * across the gap. `lengthFactor` scales the tangent magnitudes: larger
 * values keep the arc parallel to the arms longer / bow it deeper.
 *
 * Rendered as a slim bead - an elliptical tube sized off the rim's own
 * width and proud height (and meant to be drawn with the rim's material)
 * so the triangles read as the rim pattern continuing across the gaps
 * rather than as structural ribbon. A mild radial squash (`depthFraction`)
 * keeps the mid-span from ballooning off the sphere.
 *
 * CLOTHOID FITTING (`clothoidFactor`): matching tangents alone (G1) still
 * allows a curvature JUMP at the cusp - the arm's centerline arrives with
 * real curvature (tip dip + tip bend + the spiral's own curl) and a plain
 * cubic Hermite launches with whatever curvature its tangent lengths
 * happen to imply, which reads as a subtle crease in the highlight. A true
 * Euler spiral has no closed form between arbitrary 3D endpoint frames, so
 * this does what clothoid fitting is FOR instead: the centerline is a
 * QUINTIC Hermite whose end accelerations are set to `kappa * |v|^2 * N`
 * using each arm's measured tip curvature vector (`tipCurvature` from
 * mapSolidStarToFace) - exact curvature agreement at both cusps (G2), with
 * the quintic ramping curvature smoothly (near-linearly, clothoid-style)
 * in between. `clothoidFactor` scales the matched curvature: 0 falls back
 * to the flat-launch behavior, 1 = exact match, >1 overshoots for a more
 * flourished horn.
 */
/**
 * Builds the horn arc's centerline function alone (no cross-section
 * geometry) - the quintic-Hermite-plus-radial-squash from `buildHornArc`,
 * factored out so the flyover camera path can fly along the exact curve
 * the rendered bead follows instead of approximating it.
 * @returns {(t: number) => THREE.Vector3} t in [0,1], tipA at 0, tipB at 1
 */
export function hornArcPointAt(tipA, tipB, options = {}) {
  const { lengthFactor = 0.55, depthFraction = 0.95, clothoidFactor = 1 } = options;

  const P0 = tipA.tipPosition.clone();
  const P1 = tipB.tipPosition.clone();
  const span = P0.distanceTo(P1);
  const L = span * lengthFactor;
  const m0 = tipA.tipTangent.clone().multiplyScalar(L);
  const m1 = tipB.tipTangent.clone().multiplyScalar(-L);
  // End accelerations: pure normal component kappa*|v|^2*N reproduces the
  // arm's curvature exactly at the endpoint (speed there is |m| = L).
  // Curvature vectors are direction-invariant, so the arrival end needs no
  // sign flip even though the curve traverses against B's tangent.
  const zero = new THREE.Vector3();
  const A0 = (tipA.tipCurvature || zero).clone().multiplyScalar(clothoidFactor * L * L);
  const A1 = (tipB.tipCurvature || zero).clone().multiplyScalar(clothoidFactor * L * L);

  // Quintic Hermite: position + velocity + acceleration prescribed at both
  // ends (h00/h10/h20 at t=0, h01/h11/h21 at t=1).
  const hermite = (t) => {
    const t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
    return new THREE.Vector3()
      .addScaledVector(P0, 1 - 10 * t3 + 15 * t4 - 6 * t5)
      .addScaledVector(m0, t - 6 * t3 + 8 * t4 - 3 * t5)
      .addScaledVector(A0, (t2 - 3 * t3 + 3 * t4 - t5) / 2)
      .addScaledVector(P1, 10 * t3 - 15 * t4 + 6 * t5)
      .addScaledVector(m1, -4 * t3 + 7 * t4 - 3 * t5)
      .addScaledVector(A1, (t3 - 2 * t4 + t5) / 2);
  };
  // Blend toward `depthFraction` of the endpoints' radius mid-span (sin
  // profile, zero at both ends so the cusps stay exactly ON the tips).
  return (t) => {
    const p = hermite(t);
    const baseR = THREE.MathUtils.lerp(P0.length(), P1.length(), t);
    const target = baseR * THREE.MathUtils.lerp(1, depthFraction, Math.sin(Math.PI * t));
    const len = p.length();
    if (len > 1e-9) p.multiplyScalar(target / len);
    return p;
  };
}

/**
 * The point three arm tips converge on for both the snap-joint hub piece
 * and the Star Odyssey spiral connector - "the center of the current
 * circular horn triangle": simply the centroid of the three tips' world
 * positions. `buildHornArc`'s own arc never needed this (it only ever
 * looks at one pair at a time), so it's computed fresh here from all
 * three at once.
 * @returns {THREE.Vector3}
 */
export function hornTriangleCenter(tipA, tipB, tipC) {
  return tipA.tipPosition.clone()
    .add(tipB.tipPosition)
    .add(tipC.tipPosition)
    .multiplyScalar(1 / 3);
}

// ---------------------------------------------------------------------
// DEBUG MODE: three markers ("Show connection rectangles" in the panel)
// visualizing the two rectangles a hub-to-vertex connector (the reverted
// "Moebius Connect" attempt) would need to join, plus where the hub itself
// sits - built fresh so the shapes can be inspected on their own, decoupled
// from any actual connector geometry. Not wired into any connectorStyle;
// `rebuild()` draws these as an independent overlay whenever
// `params.debugConnections` is on, regardless of which preset is active.
// ---------------------------------------------------------------------

/**
 * Shared cross-section box builder for the two debug rectangles below:
 * a plain BoxGeometry (width along `tangent x radial`, thickness along the
 * remaining axis, `depth` a thin sliver along `tangent` itself just so it
 * reads as a flat plate rather than a zero-volume quad) positioned and
 * oriented at `position`. Callers wrap the result in `THREE.EdgesGeometry`
 * for a wireframe outline.
 */
function buildRectMarkerGeometry(position, tangent, radial, width, thick, depth) {
  const major = new THREE.Vector3().crossVectors(tangent, radial);
  if (major.lengthSq() < 1e-10) {
    major.set(Math.abs(tangent.x) < 0.9 ? 1 : 0, Math.abs(tangent.x) < 0.9 ? 0 : 1, 0);
    major.addScaledVector(tangent, -major.dot(tangent));
  }
  major.normalize();
  const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();
  const geometry = new THREE.BoxGeometry(width, thick, depth);
  geometry.applyMatrix4(new THREE.Matrix4().makeBasis(major, minor, tangent));
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

/**
 * DEBUG: a thin ring outline at a face's own hub radius (`hubRadiusFrac *
 * R_out`), sampled through `mapStarPoint` (not a flat face.center + U/W
 * circle) so it actually rides on the star surface's own bulge/twist/dip
 * at the hub instead of floating off it - "where the hub is".
 */
export function buildHubRingDebug(face, params = {}) {
  const { hubRadiusFrac = 0.16, segments = 64 } = params;
  const R = face.R_out;
  const radius = R * hubRadiusFrac;
  const positions = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const p = mapStarPoint(radius * Math.cos(a), radius * Math.sin(a), R, face, params);
    positions.push(p.x, p.y, p.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/**
 * DEBUG: the pentagon hub's own full-width/thickness cross-section at one
 * arm's hub-side anchor (see `computeHubAnchors`) - sized exactly
 * `bandHalfWidth * 2` (the star's own hub width, where `buildSolidStar2D`'s
 * arms reach their widest) by `thickness` (the star sheet's own uniform
 * thickness, see `mapSolidStarToFace`'s constant `halfT`), oriented the
 * same way `computeRibbonFrames` orients a connector cross-section (major =
 * tangent x radial, minor = tangent x major).
 */
export function buildHubRectDebug(anchor, params = {}) {
  const { R = 1, bandHalfWidth = 0.22, thickness: armThicknessFrac = 0.015 } = params;
  const width = R * bandHalfWidth * 2;
  const thick = R * armThicknessFrac;
  const depth = R * 0.01;
  return buildRectMarkerGeometry(anchor.tipPosition, anchor.tipTangent, anchor.tipNormal, width, thick, depth);
}

/**
 * DEBUG: the shared vertex's own "Mercedes tristar" cross-section - the
 * target width/thickness `buildSpiralVortexRibbonGroup`'s bands converge to
 * at `hornTriangleCenter` (its fixed 1.4x flare over `spiralRibbonWidthFrac`,
 * see computeRibbonFrames' endWidthFrac default, and `spiralRibbonThicknessFrac`
 * directly). Oriented off one of the three converging tips' own incoming
 * direction (arbitrary but consistent - the three bands arrive from
 * different angles, so there's no single "correct" orientation, only a
 * representative one).
 */
export function buildTristarRectDebug(tipA, tipB, tipC, params = {}) {
  const { R = 1, spiralRibbonWidthFrac = 0.09, spiralRibbonThicknessFrac = 0.012 } = params;
  const center = hornTriangleCenter(tipA, tipB, tipC);
  const width = R * spiralRibbonWidthFrac * 1.4;
  const thick = R * spiralRibbonThicknessFrac;
  const depth = R * 0.01;
  const tangent = tipA.tipPosition.clone().sub(center);
  if (tangent.lengthSq() < 1e-10) tangent.set(1, 0, 0); else tangent.normalize();
  const radial = center.clone().normalize();
  return buildRectMarkerGeometry(center, tangent, radial, width, thick, depth);
}

/**
 * DEBUG "auxiliary" marker 1/2, the "edge rectangles": bridges the
 * SHORT side of two CONSECUTIVE arms' hub rectangles (see
 * `buildHubRectDebug` - a rectangle whose long sides run its full
 * `bandHalfWidth * 2` width and whose short sides, at its two `major`-axis
 * extremes, are just `thickness` long) into one quad, tracing that stretch
 * of the pentagon hub's own boundary between them.
 *
 * Each rectangle has two short sides (`major = +halfW` and `major =
 * -halfW`) - at a wide `bandHalfWidth` relative to `hubRadiusFrac` (e.g.
 * hub radius 0.37), one of the two sits noticeably closer to that SAME
 * arm's own tip (the rim) than the other; bridging the OTHER one (the
 * far-from-rim side, per request) is what actually traces the pentagon
 * hub's own boundary between two consecutive arms - the near-rim side
 * instead follows each arm's own outline out toward its tip. Reported:
 * bridging whichever corners simply happened to sit closest TO EACH OTHER
 * (an earlier approach) didn't consistently pick the same side either -
 * this picks each rectangle's own far-from-rim short side independently
 * (by distance to that arm's own tip), then bridges those two.
 * @returns {THREE.BufferGeometry} 4 vertices, meant for `THREE.LineLoop`
 */
export function buildHubEdgeRectDebug(anchorA, tipA, anchorB, tipB, params = {}) {
  const { R = 1, bandHalfWidth = 0.22, thickness: armThicknessFrac = 0.015 } = params;
  const halfW = R * bandHalfWidth;
  const halfT = (R * armThicknessFrac) / 2;
  const depth = R * 0.01;

  const frame = (anchor, tip) => {
    const tangent = anchor.tipTangent;
    const radial = anchor.tipNormal;
    const major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) {
      major.set(Math.abs(tangent.x) < 0.9 ? 1 : 0, Math.abs(tangent.x) < 0.9 ? 0 : 1, 0);
      major.addScaledVector(tangent, -major.dot(tangent));
    }
    major.normalize();
    const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();
    const base = anchor.tipPosition.clone().addScaledVector(tangent, depth / 2);
    const plus = base.clone().addScaledVector(major, halfW);
    const minus = base.clone().addScaledVector(major, -halfW);
    const farSide = plus.distanceToSquared(tip.tipPosition) >= minus.distanceToSquared(tip.tipPosition) ? plus : minus;
    return { minor, farSide };
  };
  const A = frame(anchorA, tipA);
  const B = frame(anchorB, tipB);

  // `major`/`minor` are computed independently per anchor (no shared
  // "previous frame" to stay continuous with, unlike `computeRibbonFrames`'
  // own sign-flip guard along a single curve) - two different arms' minor
  // axes can easily land pointing opposite ways. Left uncorrected, the quad
  // below crosses itself into a bowtie/X instead of a simple loop; flipping
  // B's minor to match A's keeps the two edges (A's and B's) winding the
  // same way around the loop.
  const minorB = A.minor.dot(B.minor) < 0 ? B.minor.clone().negate() : B.minor;

  const corners = [
    A.farSide.clone().addScaledVector(A.minor, halfT),
    A.farSide.clone().addScaledVector(A.minor, -halfT),
    B.farSide.clone().addScaledVector(minorB, -halfT),
    B.farSide.clone().addScaledVector(minorB, halfT),
  ];
  const positions = [];
  for (const c of corners) positions.push(c.x, c.y, c.z);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/**
 * DEBUG "auxiliary" marker 2/2, the "tristar arm rectangles": each of a
 * shared vertex's 3 converging bars has a rectangular cross-section out
 * along its own length - not just at the shared center
 * (`buildTristarRectDebug`) - positioned by sliding from the tip straight
 * toward the shared center, stopping where all 3 bars' cross-sections
 * would just start touching each other.
 *
 * Since each bar's position interpolates straight toward the exact SAME
 * `center` point, the gap between bar i and bar j's positions scales
 * exactly as `(1 - t) * (their tip-to-tip distance)` - so the fraction `t`
 * at which that gap first equals a chosen touching-width has a closed
 * form, no iteration needed. The largest `t` across all 3 pairs is used
 * for all 3 markers, so none of the three pairs has already started
 * overlapping by the time they're drawn.
 *
 * The first version used the tip's own true half-width (same formula
 * `buildSpiralVortexRibbonGroup`'s `armHalfWidth` uses) for BOTH the
 * rendered box size AND the touching-width in the formula above - reported
 * as reading about 2x too wide and landing about 3x too far from the
 * triangle's own center than expected. `renderWidthFrac`/`touchWidthFrac`
 * apply those two corrections as independent fractions of that same true
 * tip width (1/2 and 1/3 respectively) rather than re-deriving an exact
 * touching geometry (which would need the true angle between each bar's
 * own width axis and the direction to its neighbor - not a fixed ratio
 * this module currently computes).
 * @returns {THREE.BufferGeometry[]} one box geometry per tip, same order as tipA/tipB/tipC
 */
export function buildTristarArmRectsDebug(tipA, tipB, tipC, params = {}) {
  const {
    R = 1,
    bandHalfWidth = 0.22,
    tipWidthFrac = 0.15,
    thickness: armThicknessFrac = 0.015,
    renderWidthFrac = 0.5,
    touchWidthFrac = 1 / 3,
  } = params;
  const trueWidth = R * bandHalfWidth * tipWidthFrac * 2;
  const renderWidth = trueWidth * renderWidthFrac;
  const touchWidth = trueWidth * touchWidthFrac;
  const thick = R * armThicknessFrac;
  const depth = R * 0.01;
  const center = hornTriangleCenter(tipA, tipB, tipC);
  const tips = [tipA, tipB, tipC];

  let t = 0;
  for (let i = 0; i < 3; i++) {
    const a = tips[i], b = tips[(i + 1) % 3];
    const d = a.tipPosition.distanceTo(b.tipPosition);
    if (d < 1e-9) continue;
    const pairT = 1 - touchWidth / d;
    t = Math.max(t, Math.min(1, Math.max(0, pairT)));
  }

  return tips.map((tip) => {
    const position = tip.tipPosition.clone().lerp(center, t);
    const toCenter = center.clone().sub(tip.tipPosition);
    const tangent = toCenter.lengthSq() > 1e-12 ? toCenter.normalize() : tip.tipTangent.clone();
    const radial = position.clone().normalize();
    return buildRectMarkerGeometry(position, tangent, radial, renderWidth, thick, depth);
  });
}

function cylinderBetween(start, direction, length, radius, segments = 16) {
  const geom = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  geom.translate(0, length / 2, 0); // base at local origin, extends along +Y
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  geom.applyQuaternion(quat);
  geom.translate(start.x, start.y, start.z);
  return geom;
}

/**
 * Snap-joint hub piece ("Stardream - 3D Printing" preset, peg + socket
 * friction fit, user-chosen "small separate corner hub" topology): one
 * small printed part per dodecahedron vertex - a rounded body at
 * `hornTriangleCenter`, with three pegs reaching out toward each of the
 * three meeting tips' own snap-hole sockets. Each peg is sized a touch
 * smaller than the socket radius (`params.snapPegRadiusFrac` vs. the star
 * sheet's own `snapHoleRadiusFrac`) for a friction fit, and driven deep
 * into the body (not just touching its surface) so the two overlap
 * solidly - overlapping solid primitives print fine without true CSG
 * union, which this deliberately leans on instead of attempting a real
 * boolean merge.
 * @returns {THREE.Group}
 */
export function buildSnapHubGroup(tipA, tipB, tipC, params = {}) {
  const {
    R = 1,
    hubBodyRadiusFrac = 0.07,
    snapPegRadiusFrac = 0.045,
    snapPegLengthFrac = 0.16,
    // How far past the socket's own position each peg extends, as a
    // multiple of the actual center-to-socket distance - a small overshoot
    // so the peg fully pokes through the thin printed sheet (a through-hole
    // needs the peg to reach past its far face, not just touch it), while
    // still being sized off the REAL geometry-derived distance instead of a
    // flat fraction of R that had no relationship to how far this
    // particular tip's socket actually sits.
    snapPegOvershoot = 1.15,
    // Which of the 3 tips actually get a peg drawn. In single-face preview
    // (the only place this is ever called from) only ONE of the triangle's
    // 3 tips belongs to the face on screen - the other 2 pegs would aim at
    // sockets on faces that aren't rendered, so they'd just be thin sticks
    // shooting off past the visible star into empty space with nothing to
    // anchor them, reading as "way too large/long" even though their
    // length is correctly under the triangle's own side length. Defaults to
    // all 3 so a full-assembly view (if ever built) still gets every peg.
    pegMask = [true, true, true],
  } = params;

  const center = hornTriangleCenter(tipA, tipB, tipC);
  const group = new THREE.Group();

  const bodyGeom = new THREE.SphereGeometry(R * hubBodyRadiusFrac, 20, 16);
  bodyGeom.translate(center.x, center.y, center.z);
  group.add(new THREE.Mesh(bodyGeom));

  const pegRadius = R * snapPegRadiusFrac;
  const fallbackLength = R * snapPegLengthFrac;
  const tips = [tipA, tipB, tipC];
  for (let i = 0; i < tips.length; i++) {
    if (!pegMask[i]) continue;
    const tip = tips[i];
    // Aim at the socket's own world position, not the raw tip point: the
    // hole is inset along the arm's own (possibly bent/twisted) centerline,
    // not on the straight line from this center to the tip, so a peg aimed
    // at `tipPosition` generally misses the hole entirely - this was the
    // reported "hub not connected to the tips" bug.
    const target = tip.snapHolePosition || tip.tipPosition;
    const toTarget = target.clone().sub(center);
    const dist = toTarget.length();
    const direction = dist > 1e-9 ? toTarget.multiplyScalar(1 / dist) : new THREE.Vector3(0, 0, 1);
    const pegLength = dist > 1e-9 ? dist * snapPegOvershoot : fallbackLength;
    const pegGeom = cylinderBetween(center, direction, pegLength, pegRadius);
    group.add(new THREE.Mesh(pegGeom));
  }
  return group;
}

/**
 * Star Odyssey's replacement for the horn arc: instead of one side of the
 * triangle bowing tip-to-tip around the OUTSIDE, each of the three tips
 * spirals INWARD, converging at `hornTriangleCenter` - a small three-armed
 * vortex/funnel instead of a curved triangle.
 *
 * Two problems with the first version of this (reported after shipping):
 * the spiral turned the wrong way, and the merge into the tip had a visible
 * kink - it didn't even start exactly AT the tip point (the old parametrization
 * placed t=0 a full sweep-radius away from it), let alone match the arm's own
 * departure tangent there.
 *
 * Fixed with two curves added together:
 *  1. A tangent-matched quadratic Bezier from the tip P to the center C,
 *     with its control point placed along the arm's own outward tip
 *     tangent - so the BASE curve alone already leaves the tip exactly
 *     continuing the arm's direction (like the horn arc's own "leaves tip A
 *     along A's outward direction" convention), and lands exactly at C.
 *  2. A swirl added on top: sweep radius follows an envelope that is BOTH
 *     zero-valued and zero-SLOPE at t=0 (t^2*(1-t), which vanishes with a
 *     flat tangent at the origin) - so the swirl contributes nothing to
 *     either position or tangent right at the tip, leaving the Bezier's own
 *     clean tangent match untouched, then rises to a peak and eases back to
 *     zero at the center so the three tips still converge there exactly.
 *     The angle itself ramps as `t^2` (zero angular RATE at t=0, growing
 *     linearly with t) - curvature growing linearly from zero, arc-length
 *     to arc-length, is the defining property of a clothoid/Euler spiral,
 *     which is what gives the gradual, kink-free spin-up into the vortex
 *     instead of an abrupt one.
 * The combination is G1-continuous with the arm's tangent at the tip by
 * construction (checked analytically: the swirl's derivative is exactly
 * zero there regardless of `turns`/`sweepFrac`), not merely close.
 * @param {number} [options.direction=-1] rotation handedness; flip the sign
 *   to reverse which way the vortex spins.
 * @param {number} [options.launchFrac=0.15] where the connector actually
 *   MEETS the arm, as a fraction of the tip-to-center distance pulled back
 *   from the true tip along the tip's own outward tangent - 0 meets right
 *   at the true tip, larger values meet further in toward the star's
 *   center. The true tip is where the arm's cross-section is narrowest and
 *   most sharply curved (the exponential tip-bend that pre-angles it to
 *   meet a connector) - starting a wide connector, especially a flat
 *   ribbon, exactly there read as a separate bulge stuck onto the end of
 *   the arm ("ear lobe", reported after shipping); meeting it a little
 *   further back, in the arm's straighter part, reads as a continuation of
 *   the arm instead of an add-on.
 * @param {number} [options.lengthMultiplier=1] extends the connector
 *   BACKWARD past the true tip, into the arm toward the hub, so its total
 *   tip-to-center span is this many times the arm's own true tip-to-center
 *   distance - "fusing" further into the arm's own surface rather than
 *   just meeting at (or near) the tip. Composes with `launchFrac`: a
 *   `launchFrac` of 0 and a `lengthMultiplier` of 1.5 starts the connector
 *   0.5x the tip-to-center span further back into the arm than the true
 *   tip itself.
 * @returns {(t: number) => THREE.Vector3} t in [0,1], meet point at 0, center at 1
 */
export function spiralVortexPointAt(tip, center, options = {}) {
  const { turns = 0.65, sweepFrac = 0.4, launchFrac = 0.15, lengthMultiplier = 1, direction = -1 } = options;
  const trueTip = tip.tipPosition;
  const trueAxisLen = center.distanceTo(trueTip);
  const offsetFrac = launchFrac - (lengthMultiplier - 1);
  const P = trueTip.clone().addScaledVector(tip.tipTangent, offsetFrac * trueAxisLen);
  const C = center.clone();
  const axis = C.clone().sub(P);
  const axisLen = axis.length();
  if (axisLen > 1e-9) axis.normalize(); else axis.set(0, 0, 1);

  let e1 = tip.tipTangent.clone().addScaledVector(axis, -tip.tipTangent.dot(axis));
  if (e1.lengthSq() < 1e-8) {
    e1 = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    e1.addScaledVector(axis, -e1.dot(axis));
  }
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();

  // Bezier handle length (how far the curve keeps going in the tip's own
  // direction before bending toward center) - a fixed fraction of the
  // (possibly shortened, if `launchFrac` pulled the start point in)
  // remaining span. No longer separately user-exposed since `launchFrac`
  // now controls where the curve STARTS rather than how its handle scales.
  const M = P.clone().addScaledVector(tip.tipTangent, axisLen * 0.4);
  const base = (t) => {
    const mt = 1 - t;
    return P.clone().multiplyScalar(mt * mt)
      .addScaledVector(M, 2 * mt * t)
      .addScaledVector(C, t * t);
  };

  const thetaMax = direction * turns * Math.PI * 2;
  const maxSweep = axisLen * sweepFrac;
  // Rescaled by 27/4 (the reciprocal of t^2*(1-t)'s own peak, at t=2/3) so
  // `sweepFrac` means the swirl's actual peak deviation, not the raw
  // envelope shape's smaller, not-round-number maximum.
  const envelope = (t) => (t * t * (1 - t)) * (27 / 4);

  return (t) => {
    const theta = thetaMax * t * t;
    const sweep = maxSweep * envelope(t);
    return base(t)
      .addScaledVector(e1, sweep * Math.cos(theta))
      .addScaledVector(e2, sweep * Math.sin(theta));
  };
}

/**
 * Extrudes one tip's spiral-vortex arm into a solid tapering tube (circular
 * cross-section, shrinking from the arm's own tip radius down to a small
 * nub at the shared center) - the Star Odyssey equivalent of one side of
 * `buildHornArc`'s bead, for a single tip.
 */
function buildSpiralVortexArm(tip, center, options = {}) {
  const {
    segments = 40,
    radialSegments = 10,
    startRadius = 0.04,
    endRadiusFrac = 0.25,
  } = options;
  const pointAt = spiralVortexPointAt(tip, center, options);
  const endRadius = startRadius * endRadiusFrac;

  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = pointAt(t);
    const tangent = pointAt(Math.min(t + 1e-3, 1)).sub(pointAt(Math.max(t - 1e-3, 0))).normalize();
    let ortho = Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const major = new THREE.Vector3().crossVectors(tangent, ortho).normalize();
    const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, t);
    for (let k = 0; k <= radialSegments; k++) {
      const phi = (k / radialSegments) * Math.PI * 2;
      const v = p.clone()
        .addScaledVector(major, radius * Math.cos(phi))
        .addScaledVector(minor, radius * Math.sin(phi));
      positions.push(v.x, v.y, v.z);
    }
  }
  const ring = radialSegments + 1;
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < radialSegments; k++) {
      const s0 = i * ring + k, s1 = s0 + 1, s2 = s0 + ring, s3 = s2 + 1;
      indices.push(s0, s2, s1, s1, s2, s3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * All three tips' spiral-vortex arms for one dodecahedron vertex, as a
 * single Group - the Star Odyssey replacement for the three `buildHornArc`
 * beads that would otherwise connect this triangle's three pairs.
 * @returns {THREE.Group}
 */
export function buildSpiralVortexGroup(tipA, tipB, tipC, params = {}) {
  const { R = 1, spiralTurns = 0.65, spiralSweepFrac = 0.4, spiralLaunchFrac = 0.15, spiralLengthMultiplier = 1, spiralArcWidthFrac = 0.035 } = params;
  const center = hornTriangleCenter(tipA, tipB, tipC);
  const group = new THREE.Group();
  const startRadius = R * spiralArcWidthFrac;
  for (const tip of [tipA, tipB, tipC]) {
    const geom = buildSpiralVortexArm(tip, center, {
      turns: spiralTurns,
      sweepFrac: spiralSweepFrac,
      launchFrac: spiralLaunchFrac,
      lengthMultiplier: spiralLengthMultiplier,
      startRadius,
    });
    group.add(new THREE.Mesh(geom));
  }
  return group;
}

/**
 * Shared per-step Frenet-ish frame the ribbon's main slab AND its rim bead
 * both build from - factored out so the two geometries can never drift
 * apart from each other (they read the exact same `p`/`major`/`minor`/
 * `halfW`/`halfThick` per step), which is what "no gaps, same slope at the
 * joint" between the two actually requires in practice.
 *
 * Two joint-matching blends happen here, both against `spiralVortexPointAt`
 * over the same first-35%-of-curve stretch the tip-normal blend already
 * uses (`blendT`) - beyond that the connector is well clear of the star's
 * own geometry and there's nothing left to match:
 *  - `armHalfWidth`, if given, is the arm's own true half-width at the tip
 *    (same formula `buildSolidStar2D` uses for its narrowest, theta=0 end).
 *    Without matching this, a `startWidth` narrower than the arm's actual
 *    tip width left a visible step/gap in the outline right at the seam.
 *  - `armHalfThickness`, if given, is the arm's own true half-thickness at
 *    the tip. The ribbon's curve runs along the SAME surface centerline
 *    the arm's own slab is centered on, so a ribbon thickness that didn't
 *    match the arm's right at t=0 meant two differently-thick opaque slabs,
 *    both centered on that line, overlapping in 3D space right where the
 *    arm's own surface trim leaves a short strip of its slab behind for the
 *    ribbon to cover (see armTrims' marginFrac in rebuild()) - rendering as
 *    flickering "torn" fragments (reported as the surface "shattering").
 *    Matching thickness exactly at t=0 removes the mismatch at its source,
 *    and by the time it diverges toward the ribbon's own `thickness`
 *    further along the curve, curve-arc-length math confirms that span
 *    (t up to 0.35) is already well past the small margin - so there's no
 *    arm slab left there to overlap with regardless of how much the
 *    ribbon's own thickness has grown by then.
 */
function computeRibbonFrames(tip, center, options = {}) {
  const {
    segments = 48,
    startWidth = 0.08,
    // >1 now WIDENS toward the shared center instead of narrowing - three
    // strips flaring out and fusing into one broad, flat hub where they
    // meet, Mercedes-Benz tristar style, instead of tapering down to a
    // near-point. Value is relative to `startWidth`, at the tip end.
    endWidthFrac = 1.4,
    thickness = 0.012,
    armHalfWidth = 0,
    armHalfThickness = 0,
    // Extra rotation of the cross-section's (major, minor) frame about its
    // own tangent, ramped smoothstep from 0 at t=0 to `halfTwists * 180deg`
    // at t=1 - a real Mobius-style half-twist, layered ON TOP of the
    // frame's existing radial-blend rotation rather than replacing it. 0
    // (the default) leaves every other caller's frame construction
    // untouched.
    halfTwists = 0,
    // Constant offset along the frame's own `minor` axis, applied to every
    // station's `p` before the cross-section is built from it - lifts a
    // connector clear of whatever surface its curve happens to coincide
    // with. 0 (the default) leaves every other caller's frame position
    // untouched.
    surfaceLift = 0,
    // Only sample the curve's own [tMin, 1] stretch (still evaluating the
    // TRUE t at every station, not a rescaled [0,1]) - so the rendered
    // ribbon starts partway along the curve instead of at its true t=0,
    // with its width/twist/thickness at that new start exactly matching
    // what the full, untrimmed curve would have shown there. 0 (the
    // default) leaves every other caller's frames the same as before.
    tMin = 0,
  } = options;
  const pointAt = spiralVortexPointAt(tip, center, options);
  const endWidth = startWidth * endWidthFrac;
  const halfThickTarget = thickness / 2;

  const frames = [];
  let prevMajor = null;
  let arcLen = 0;
  let prevP = null;
  for (let i = 0; i <= segments; i++) {
    const t = tMin + (1 - tMin) * (i / segments);
    const p = pointAt(t);
    if (prevP) arcLen += p.distanceTo(prevP);
    prevP = p.clone();
    const tangent = pointAt(Math.min(t + 1e-3, 1)).sub(pointAt(Math.max(t - 1e-3, 0))).normalize();
    // Blend from the arm's own TRUE local surface normal at the tip (so
    // the ribbon starts flush with the actual star surface instead of
    // tilted off it - a sphere-radial approximation can be ~27 degrees off
    // right where the exponential tip-bend curls the surface, which read
    // as a visible kink/wedge exactly at the seam, independent of where
    // `launchFrac` put the start point) to a sphere-radial approximation
    // as the curve moves away from the tip into open space, where there's
    // no arm surface left to reference. Blended over the first 35% of the
    // curve - beyond that the connector is well clear of the star's own
    // geometry and the coarser approximation is indistinguishable.
    const blendT = Math.min(1, t / 0.35);
    const sphereRadial = p.clone().normalize();
    const radial = tip.tipNormal.clone().lerp(sphereRadial, blendT);
    if (radial.lengthSq() < 1e-10) radial.copy(sphereRadial); else radial.normalize();
    const major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) {
      major.set(Math.abs(tangent.x) < 0.9 ? 1 : 0, Math.abs(tangent.x) < 0.9 ? 0 : 1, 0);
      major.addScaledVector(tangent, -major.dot(tangent));
    }
    major.normalize();
    if (prevMajor && major.dot(prevMajor) < 0) major.negate();
    prevMajor = major;
    const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();

    // Smoothstep (not linear) taper: stays close to `startWidth` longer
    // near the tip, then flares out faster approaching the center, where
    // `endWidthFrac` > 1 now widens it well past `startWidth` instead of
    // narrowing it, so the three strips fan out and fuse into one broad
    // hub at the meeting point.
    const widthT = t * t * (3 - 2 * t);
    const taperHalfW = THREE.MathUtils.lerp(startWidth, endWidth, widthT) / 2;
    const halfW = armHalfWidth ? THREE.MathUtils.lerp(armHalfWidth, taperHalfW, blendT) : taperHalfW;
    const halfThick = armHalfThickness
      ? THREE.MathUtils.lerp(armHalfThickness, halfThickTarget, blendT)
      : halfThickTarget;

    // Same smoothstep envelope the width taper uses, so the twist reaches
    // its full amount exactly at t=1 (the center) with zero rate at t=0
    // (the anchor) - a flat start, matching whatever flat surface the
    // connector departs from, same reasoning as the swirl envelope in
    // `spiralVortexPointAt`.
    if (halfTwists) {
      const twistAngle = halfTwists * Math.PI * widthT;
      const cosA = Math.cos(twistAngle), sinA = Math.sin(twistAngle);
      const rotMajor = major.clone().multiplyScalar(cosA).addScaledVector(minor, sinA);
      const rotMinor = minor.clone().multiplyScalar(cosA).addScaledVector(major, -sinA);
      major.copy(rotMajor);
      minor.copy(rotMinor);
    }

    const framePoint = surfaceLift ? p.clone().addScaledVector(minor, surfaceLift) : p;

    frames.push({ t, p: framePoint, tangent, major, minor, halfW, halfThick, arcLen });
  }
  return frames;
}

/**
 * Flat-ribbon variant of `buildSpiralVortexArm`: same
 * `spiralVortexPointAt` curve, but extruded with a wide/thin rectangular
 * cross-section instead of a circular one - reads as a band rather than a
 * wire. The cross-section's own orientation is built the same way
 * `buildHornArc`'s bead is (`major = tangent x radial`, `minor = tangent x
 * major`, using the point's own position as a stand-in for the local
 * outward/radial direction) rather than the tube's arbitrary world-axis
 * fallback - a circular cross-section looks identical no matter how it's
 * rotated, so the tube never needed a "correct" orientation, but a flat
 * ribbon's whole visual identity IS its orientation: this keeps its width
 * roughly in-surface and its thickness roughly radial at every point,
 * matching the flat star sheet the ribbon is meant to be a continuation of
 * (face normal roughly radial for the ribbon's whole length - "flat,
 * perpendicular to the radius of the sphere" at the meeting point, per
 * request - rather than twisting up into an edge-on fin there).
 */
function buildSpiralVortexRibbonArm(tip, center, options = {}) {
  const frames = computeRibbonFrames(tip, center, options);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const { p, major, minor, halfW, halfThick, arcLen } of frames) {
    const c0 = p.clone().addScaledVector(major, -halfW).addScaledVector(minor, -halfThick);
    const c1 = p.clone().addScaledVector(major, halfW).addScaledVector(minor, -halfThick);
    const c2 = p.clone().addScaledVector(major, halfW).addScaledVector(minor, halfThick);
    const c3 = p.clone().addScaledVector(major, -halfW).addScaledVector(minor, halfThick);
    positions.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z);
    // UV in the same physical (world-unit) scale `mapSolidStarToFace`'s own
    // (u,w) uses - u = real arc-length travelled so far, v = position
    // across the ribbon's width - so the shared `sculptureMaterial`'s
    // tiling perforation pattern reads at a comparable density on the
    // connector as on the star sheet it's replacing a bare, patternless
    // material continuation of (reported: the connector's smooth, unlit
    // surface stood out against the star's own dotted texture right at the
    // seam). The thin thickness edges reuse the same two UV corners as
    // their major-axis neighbor - negligible stretching given how thin
    // the ribbon now is.
    uvs.push(arcLen, 0, arcLen, halfW * 2, arcLen, halfW * 2, arcLen, 0);
  }
  const ring = 4;
  const segments = frames.length - 1;
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < ring; k++) {
      const k1 = (k + 1) % ring;
      const s0 = i * ring + k, s1 = i * ring + k1, s2 = (i + 1) * ring + k, s3 = (i + 1) * ring + k1;
      indices.push(s0, s2, s1, s1, s2, s3);
    }
  }
  // Cap only the start (t=0) end - wherever the ribbon doesn't perfectly
  // cover the star's own arm surface underneath it (unavoidable with a
  // simple 4-vertex cross-section against a curved, perforated mesh), a gap
  // there lets you see straight into an open tube mouth, reading as "the
  // connector end looks like a hollow rectangle" rather than solid material.
  // The end (t=1) cap was added on the same reasoning when `endWidthFrac`
  // started widening the ribbon instead of narrowing it, but with three
  // ribbons now flaring wide and converging from three different angles
  // right there, a single FLAT quad capping each one individually reads as
  // an odd, unperforated bright plate poking out of the fused hub rather
  // than blending in (reported as "a trapezoid-like surface that is
  // popping") - removed. The three ribbons' own solid bodies converging
  // from different directions already close up that shared space without
  // it.
  indices.push(0, 1, 2, 0, 2, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Small decorative rim bead tracking each of the ribbon's two long edges,
 * riding on top of its outward-facing side - mirrors `buildStarRim`'s own
 * treatment of the star sheet's boundary (a raised bead within a narrow
 * inset of the edge, `rimProud * sin(PI * s)` so it peaks mid-band and
 * meets the flat surface with zero height at both the true edge and the
 * fully-inset side) for visual consistency between the two surfaces meeting
 * at each connection, per request. Built from the exact same per-step
 * frames (`computeRibbonFrames`) the main slab uses, so the bead can never
 * drift off the slab's own edge even as the width tapers/flares along the
 * curve. Purely additive on top of the existing slab geometry (own
 * BufferGeometry, own mesh in the group) rather than a change to the slab's
 * own cross-section, so it can't reintroduce a gap in the load-bearing
 * surface if the bead's proportions ever need retuning.
 */
function buildSpiralVortexRibbonRim(tip, center, options = {}) {
  const { rimWidthFrac = 0.22, rimProud = 0.003, rimCrossSamples = 4 } = options;
  const frames = computeRibbonFrames(tip, center, options);
  const positions = [];
  const uvs = [];
  const indices = [];
  const stationsPerEdge = rimCrossSamples + 1;
  const ring = stationsPerEdge * 2;
  for (const { p, major, minor, halfW, halfThick, arcLen } of frames) {
    // Rim band width is a fraction of the ribbon's OWN current half-width
    // (not a fixed world size) so it scales down gracefully as the ribbon
    // narrows toward the tip instead of overrunning a thin cross-section.
    const rimWidth = Math.min(halfW * rimWidthFrac, halfW * 0.45);
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k <= rimCrossSamples; k++) {
        const s = k / rimCrossSamples;
        const u = side * (halfW - rimWidth * s);
        const bump = rimProud * Math.sin(Math.PI * s);
        const v = p.clone()
          .addScaledVector(major, u)
          .addScaledVector(minor, halfThick + bump);
        positions.push(v.x, v.y, v.z);
        uvs.push(arcLen, halfW + side * u);
      }
    }
  }
  const segments = frames.length - 1;
  for (let i = 0; i < segments; i++) {
    for (let edge = 0; edge < 2; edge++) {
      for (let k = 0; k < rimCrossSamples; k++) {
        const s0 = i * ring + edge * stationsPerEdge + k;
        const s1 = s0 + 1;
        const s2 = s0 + ring;
        const s3 = s1 + ring;
        indices.push(s0, s2, s1, s1, s2, s3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Ribbon variant of `buildSpiralVortexGroup` - see
 * `buildSpiralVortexRibbonArm` for the shape itself.
 * @returns {THREE.Group}
 */
export function buildSpiralVortexRibbonGroup(tipA, tipB, tipC, params = {}) {
  const {
    R = 1,
    spiralTurns = 0.65,
    spiralSweepFrac = 0.4,
    spiralLaunchFrac = 0.15,
    spiralLengthMultiplier = 1,
    spiralRibbonWidthFrac = 0.09,
    spiralRibbonThicknessFrac = 0.012,
    thickness: armThicknessFrac = 0.015,
    bandHalfWidth = 0.22,
    tipWidthFrac = 0.15,
    ribbonRimWidthFrac = 0.22,
    ribbonRimProudFrac = 0.006,
  } = params;
  const center = hornTriangleCenter(tipA, tipB, tipC);
  const group = new THREE.Group();
  // `spiralRibbonWidthFrac` is the ribbon's own INTRINSIC width, used away
  // from the tip - right at the tip (t=0) `computeRibbonFrames` blends it
  // to `armHalfWidth` instead (the arm's own true half-width there, same
  // formula `buildSolidStar2D` uses for its narrowest end) so the two
  // surfaces' widths actually match at the seam rather than stepping.
  const startWidth = R * spiralRibbonWidthFrac;
  const thickness = R * spiralRibbonThicknessFrac;
  const armHalfWidth = R * bandHalfWidth * tipWidthFrac;
  const armHalfThickness = (R * armThicknessFrac) / 2;

  // Only draw from the shared center out to where the "tristar arm"
  // debug marker sits (see buildTristarArmRectsDebug - same touching-width
  // formula and per-pair max, so the trimmed ribbon's own visible start
  // lands at the same point that marker does), rather than continuing all
  // the way out to the tip. Straight-line distance between the tips
  // stands in for the curve's own (close to straight, for the small
  // turns/sweepFrac this connector style uses) arc length.
  const touchWidthFrac = params.touchWidthFrac ?? 1 / 3;
  const touchWidth = armHalfWidth * 2 * touchWidthFrac;
  const tips3 = [tipA, tipB, tipC];
  let tMin = 0;
  for (let i = 0; i < 3; i++) {
    const a = tips3[i], b = tips3[(i + 1) % 3];
    const d = a.tipPosition.distanceTo(b.tipPosition);
    if (d < 1e-9) continue;
    const pairT = 1 - touchWidth / d;
    tMin = Math.max(tMin, Math.min(1, Math.max(0, pairT)));
  }

  for (const tip of [tipA, tipB, tipC]) {
    const shared = {
      armHalfWidth,
      armHalfThickness,
      turns: spiralTurns,
      sweepFrac: spiralSweepFrac,
      launchFrac: spiralLaunchFrac,
      lengthMultiplier: spiralLengthMultiplier,
      startWidth,
      thickness,
      tMin,
      // halfTwists intentionally omitted - always the function's own fixed
      // quarter-turn (see buildSpiralVortexRibbonArm), not user-adjustable.
    };
    const geom = buildSpiralVortexRibbonArm(tip, center, shared);
    group.add(new THREE.Mesh(geom));
    // Small raised bead along each of the ribbon's two long edges, mirroring
    // the star sheet's own rim treatment (buildStarRim) for visual
    // consistency between the two surfaces meeting at the connection.
    const rimGeom = buildSpiralVortexRibbonRim(tip, center, {
      ...shared,
      rimWidthFrac: ribbonRimWidthFrac,
      rimProud: R * ribbonRimProudFrac,
    });
    group.add(new THREE.Mesh(rimGeom));
  }
  return group;
}

/**
 * "Rectangle Connect": replaces the star arm entirely with a Mobius-
 * twisted ribbon per arm, running from that arm's own "orange" hub-edge
 * bridge (see `computeHubEdgeAnchors`/`buildHubEdgeRectDebug` - the
 * far-from-rim short sides of two consecutive arms' hub rectangles,
 * bridged into one span) out to that arm's own "lime" tristar
 * touching-point (see `buildTristarArmRectsDebug` - where all 3 bars at
 * the shared vertex would just start touching). No star sheet is drawn at
 * all in this style (`rebuild()` gates the whole star mesh/rim behind
 * `params.hideStarArms`) - these ribbons ARE the visible geometry.
 *
 * The orange bridge is the WIDE end and the lime point is the NARROW end
 * (reported after the first version had this backward, tapering from a
 * thin peg at the hub out to a wide band at the vertex - a real
 * mismatch, since the orange bridge's own span is the arm's full hub
 * width while the lime marker is deliberately a fraction of that, see
 * `buildTristarArmRectsDebug`'s own `renderWidthFrac`) -
 * `computeRibbonFrames`'s existing width taper already supports either
 * direction; `endWidthFrac` here just comes out under 1.
 * @returns {THREE.Group}
 */
export function buildRectangleConnectorGroup(tipA, tipB, tipC, edgeAnchorA, edgeAnchorB, edgeAnchorC, params = {}) {
  const {
    R = 1,
    bandHalfWidth = 0.22,
    tipWidthFrac = 0.15,
    renderWidthFrac = 0.5,
    touchWidthFrac = 1 / 3,
    moebiusHalfTwists = 1,
    moebiusTurns = 0.06,
    spiralSweepFrac = 0.04,
    ribbonRimWidthFrac = 0.22,
    ribbonRimProudFrac = 0.006,
  } = params;
  const center = hornTriangleCenter(tipA, tipB, tipC);
  const trueWidth = R * bandHalfWidth * tipWidthFrac * 2;
  const renderWidth = trueWidth * renderWidthFrac;
  const touchWidth = trueWidth * touchWidthFrac;

  const tips = [tipA, tipB, tipC];
  const edgeAnchors = [edgeAnchorA, edgeAnchorB, edgeAnchorC];

  let t = 0;
  for (let i = 0; i < 3; i++) {
    const a = tips[i], b = tips[(i + 1) % 3];
    const d = a.tipPosition.distanceTo(b.tipPosition);
    if (d < 1e-9) continue;
    const pairT = 1 - touchWidth / d;
    t = Math.max(t, Math.min(1, Math.max(0, pairT)));
  }

  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const tip = tips[i];
    const edge = edgeAnchors[i];
    const limePosition = tip.tipPosition.clone().lerp(center, t);

    // Departs the wide bridge midpoint heading straight for the lime
    // target - there's no single natural "outward" tangent for a bridge
    // shared by two different arms the way there is for one arm's own
    // hub anchor, so this points directly at the only other anchor the
    // curve actually needs to reach.
    const toLime = limePosition.clone().sub(edge.tipPosition);
    const tangent = toLime.lengthSq() > 1e-12 ? toLime.normalize() : tip.tipTangent.clone();
    const hubEndAnchor = { tipPosition: edge.tipPosition, tipTangent: tangent, tipNormal: edge.tipNormal.clone() };

    const shared = {
      turns: moebiusTurns,
      sweepFrac: spiralSweepFrac,
      launchFrac: 0,
      lengthMultiplier: 1,
      startWidth: edge.width,
      endWidthFrac: renderWidth / edge.width,
      thickness: edge.thickness,
      // Negated - reported as twisting the wrong way; `computeRibbonFrames`'
      // twist angle is directly proportional to `halfTwists`' own sign, so
      // flipping just this one's sign reverses the direction without
      // touching the shared formula or any other caller.
      halfTwists: -moebiusHalfTwists,
    };
    const geom = buildSpiralVortexRibbonArm(hubEndAnchor, limePosition, shared);
    group.add(new THREE.Mesh(geom));
    const rimGeom = buildSpiralVortexRibbonRim(hubEndAnchor, limePosition, {
      ...shared,
      rimWidthFrac: ribbonRimWidthFrac,
      rimProud: R * ribbonRimProudFrac,
    });
    group.add(new THREE.Mesh(rimGeom));
  }
  return group;
}

export function buildHornArc(tipA, tipB, options = {}) {
  const {
    arcWidth = 0.04,    // full in-surface width of the bead
    arcHeight = 0.04,   // full radial height of the bead
    segments = 48,
    radialSegments = 10,
  } = options;

  const pointAt = hornArcPointAt(tipA, tipB, options);
  const a = arcWidth / 2;
  const b = arcHeight / 2;
  const positions = [];
  const uvs = [];
  const indices = [];

  let arcLen = 0;
  let prevPt = null;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = pointAt(t);
    const tangent = pointAt(Math.min(t + 1e-3, 1)).sub(pointAt(Math.max(t - 1e-3, 0))).normalize();
    const radial = p.clone().normalize();
    const major = new THREE.Vector3().crossVectors(tangent, radial);
    if (major.lengthSq() < 1e-10) major.set(1, 0, 0);
    major.normalize();
    const minor = new THREE.Vector3().crossVectors(tangent, major).normalize();
    if (prevPt) arcLen += p.distanceTo(prevPt);
    prevPt = p;
    // Elliptical ring: wide in-surface (major), shallow radially (minor) -
    // the same rounded-bead proportions as the rim's sin-profile cross
    // section, just closed all the way around.
    for (let k = 0; k <= radialSegments; k++) {
      const phi = (k / radialSegments) * Math.PI * 2;
      const v = p.clone()
        .addScaledVector(major, a * Math.cos(phi))
        .addScaledVector(minor, b * Math.sin(phi));
      positions.push(v.x, v.y, v.z);
      uvs.push(arcLen, (k / radialSegments) * arcWidth);
    }
  }
  const ring = radialSegments + 1;
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < radialSegments; k++) {
      const s0 = i * ring + k, s1 = s0 + 1, s2 = s0 + ring, s3 = s2 + 1;
      indices.push(s0, s2, s1, s1, s2, s3);
    }
  }

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
