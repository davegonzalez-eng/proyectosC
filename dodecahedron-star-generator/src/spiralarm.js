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
