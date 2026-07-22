// Option B prototype: a single wide, constant-width, logarithmic-spiral
// band per face, replacing the current 5-thin-arm star for that face.
//
// This is a NEW, separate module (not an in-place edit of geometry.js /
// startube.js) precisely so the old 5-arm approach stays intact as a
// fallback/reference while this is being validated in isolation - see
// spiral-prototype.html, which renders exactly one face with this band and
// nothing else from the rest of the app.
//
// Centerline: a logarithmic spiral r(theta) = r0 * exp(-k*theta), starting
// at the face rim (theta = 0, r = r0, angle = the same "vertex 0" direction
// the old star's arm 0 tip used) and spiraling inward over `turns` full
// turns down to a small "hole" radius. Past that point the path continues
// at constant radius for `holeLoopTurns` more turns before ending - since
// the band is wide relative to that radius, this tight closing loop reads
// as a small round terminal eye-hole (the reference lamps' paisley tips)
// rather than the star's old sharp tip.
//
// The slab cross-section (major = width direction, minor = thickness
// direction) is built the same way startube.js orients its flattened cut
// ends: major = cross(tangent, radial-from-sphere-center), so the band lies
// flat against the sphere's surface everywhere along its length, not just
// at its endpoints. Width and thickness are constant for nearly the whole
// length, only tapering down near the rim attachment (t=0) to whatever a
// future fusion with a neighboring face's band would need to match.

import * as THREE from 'three';
import { applySurfaceTwist, applyTipDip } from './geometry.js';

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * @param {Face} face from buildDodecahedron
 * @param {object} [params]
 * @param {number} [params.turns=1.4] spiral turns from the rim down to the hole radius
 * @param {number} [params.holeLoopTurns=0.85] extra turns at ~constant radius that close the terminal eye-hole
 * @param {number} [params.tipScale=0.95] starting radius at the rim, as a fraction of face.R_out
 * @param {number} [params.rHoleFrac=0.16] hole-loop radius, as a fraction of face.R_out
 * @param {number} [params.bandHalfWidth=0.22] half-width of the band (fraction of face.R_out), constant along nearly the whole length
 * @param {number} [params.startHalfWidthFrac=0.4] half-width at t=0 as a fraction of bandHalfWidth, tapering up to full width
 * @param {number} [params.endHalfWidthFrac=0.32] half-width during the closing hole loop, as a fraction of bandHalfWidth - must be small enough that the loop's swept width doesn't fill in its own radius (rHoleFrac), or there's no visible hole
 * @param {number} [params.thickness=0.05] slab thickness (fraction of face.R_out) through most of the band
 * @param {number} [params.startThicknessFrac=0.6] thickness at t=0 as a fraction of `thickness`
 * @param {number} [params.bulgeStrength=0] dome height at the face center, same convention as buildStar
 * @param {number} [params.tipDipStrength=0] inward pull toward the sphere center, same convention as buildStar
 * @param {number} [params.surfTwistDeg=0] surface twist (deg), same convention as buildStar's applySurfaceTwist
 * @param {number} [params.segments=240] arc-length-resampled extrusion stations
 * @param {number} [params.samples=500] raw parametric samples used to build the resampling curve
 * @returns {{geometry: THREE.BufferGeometry, curve: THREE.CatmullRomCurve3, points: THREE.Vector3[], metrics: object}}
 */
export function buildSpiralBand(face, params = {}) {
  const {
    turns = 1.4,
    holeLoopTurns = 0.85,
    tipScale = 0.95,
    rHoleFrac = 0.16,
    bandHalfWidth = 0.22,
    startHalfWidthFrac = 0.4,
    endHalfWidthFrac = 0.32,
    thickness = 0.05,
    startThicknessFrac = 0.6,
    bulgeStrength = 0,
    tipDipStrength = 0,
    surfTwistDeg = 0,
    segments = 240,
    samples = 500,
  } = params;

  const surfTwistRad = THREE.MathUtils.degToRad(surfTwistDeg);
  const R = face.R_out;
  const r0 = R * tipScale;
  const rHole = R * rHoleFrac;
  const spiralThetaMax = turns * Math.PI * 2;
  const kSpiral = Math.log(r0 / rHole) / spiralThetaMax;
  const loopThetaMax = holeLoopTurns * Math.PI * 2;
  const thetaTotal = spiralThetaMax + loopThetaMax;
  const bandHalfWidthWorld = R * bandHalfWidth;
  const thicknessWorld = R * thickness;

  const place = (theta) => {
    const r = theta <= spiralThetaMax ? r0 * Math.exp(-kSpiral * theta) : rHole;
    const u = r * Math.cos(theta);
    const w = r * Math.sin(theta);
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

  // Where (as an ARC-LENGTH fraction, matching the `t` used below) the
  // closing hole loop begins - needed because the spiral's own parameter
  // (uniform in theta) is very much NOT uniform in arc length: the tight
  // inner turns near the tip cover far less distance per radian than the
  // wide outer turns near the rim, so a theta-fraction can't be used
  // directly against the arc-length-resampled stations.
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

    const startBlend = smoothstep(0, 0.08, t);
    // Taper the band down to a thin strand before it enters the closing
    // hole loop, so that thin strand's swept width stays narrower than the
    // loop's radius - otherwise the loop just fills in solid instead of
    // leaving an open terminal eye-hole (see spiral-prototype.html notes).
    const loopTaperBlend = smoothstep(spiralFrac * 0.75, spiralFrac, t);
    const widthFrac = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(startHalfWidthFrac, 1, startBlend),
      endHalfWidthFrac,
      loopTaperBlend
    );
    const halfWidth = bandHalfWidthWorld * widthFrac;
    const halfT = (thicknessWorld * THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(startThicknessFrac, 1, startBlend),
      endHalfWidthFrac,
      loopTaperBlend
    )) / 2;

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
  // band rather than a hollow shell - the rim end (future fusion point)
  // and the tail end at the middle of the eye-hole loop.
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
    holeRadiusOverBandWidth: rHole / (2 * bandHalfWidthWorld),
  };

  return { geometry, curve, points, metrics };
}
