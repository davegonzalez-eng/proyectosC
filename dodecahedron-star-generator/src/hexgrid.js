// Builds a hexagonal-grid lattice filling a star's interior, as an
// alternative to the solid membrane fill: a pointy-top hex grid is tiled
// over the star's local 2D (u, w) coordinates, clipped to the star's
// (possibly concave) outline, and each surviving strut is turned into a
// thin flat quad in 3D following the same bulge + tip-dip profile as the
// star itself (via the shared `applyTipDip`), so the lattice sits flush on
// the same surface instead of drifting away from it near the edges.

import * as THREE from 'three';
import { applyTipDip } from './geometry.js';

/** Cheap deterministic hash of two integers to [0, 1). */
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Parametric intersection of segment AB with segment CD, or null if they don't cross. */
function segIntersectT(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/** Clip segment AB against a (possibly concave) polygon, returning the sub-segments that lie inside it. */
function clipSegmentToPolygon(a, b, poly) {
  const ts = new Set([0, 1]);
  for (let i = 0; i < poly.length; i++) {
    const t = segIntersectT(a, b, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null) ts.add(t);
  }
  const sorted = [...ts].sort((x, y) => x - y);
  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = sorted[i], t1 = sorted[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const tm = (t0 + t1) / 2;
    const mid = { x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm };
    if (pointInPolygon(mid, poly)) {
      segments.push([
        { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
        { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
      ]);
    }
  }
  return segments;
}

/**
 * Edges of a (optionally jittered) pointy-top hex grid covering `polygon`'s
 * bounding box, clipped to the polygon and de-duplicated so shared edges
 * between adjacent cells are only returned once.
 *
 * With `jitter` > 0 every lattice vertex is displaced by a deterministic
 * pseudo-random offset derived from its own (pre-jitter) position - so the
 * three cells sharing a vertex all move it identically, and the grid stays
 * a watertight tiling of irregular polygons. Jittering a hex lattice's
 * vertices is a classic cheap stand-in for a Voronoi diagram of jittered
 * seeds: cells vary in size and shape, reading organic/cellular rather
 * than mechanical.
 *
 * @param {{x:number,y:number}[]} polygon
 * @param {number} cellSize hex "radius" (center to corner)
 * @param {number} [jitter=0] vertex displacement as a fraction of cellSize (0..~0.5)
 * @returns {[{x,y},{x,y}][]}
 */
export function hexGridEdges(polygon, cellSize, jitter = 0) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const colStep = Math.sqrt(3) * cellSize;
  const rowStep = 1.5 * cellSize;
  const rows = Math.ceil((maxY - minY) / rowStep) + 2;
  const cols = Math.ceil((maxX - minX) / colStep) + 2;

  const jitterCorner = (p) => {
    if (!jitter) return p;
    // Hash the pre-jitter position (quantized in cell units) so every cell
    // computes the identical offset for a shared corner.
    const ix = Math.round((p.x / cellSize) * 50);
    const iy = Math.round((p.y / cellSize) * 50);
    const angle = hash2(ix, iy) * Math.PI * 2;
    const mag = (0.35 + 0.65 * hash2(ix + 7919, iy - 104729)) * jitter * cellSize;
    return { x: p.x + Math.cos(angle) * mag, y: p.y + Math.sin(angle) * mag };
  };

  const edgeMap = new Map();
  const addEdge = (p1, p2) => {
    const k1 = `${p1.x.toFixed(5)},${p1.y.toFixed(5)}|${p2.x.toFixed(5)},${p2.y.toFixed(5)}`;
    const k2 = `${p2.x.toFixed(5)},${p2.y.toFixed(5)}|${p1.x.toFixed(5)},${p1.y.toFixed(5)}`;
    if (edgeMap.has(k1) || edgeMap.has(k2)) return;
    edgeMap.set(k1, [p1, p2]);
  };

  for (let row = -1; row <= rows; row++) {
    const cy = minY + row * rowStep;
    const xOffset = row % 2 !== 0 ? colStep / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const cx = minX + col * colStep + xOffset;
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        corners.push(jitterCorner({ x: cx + cellSize * Math.cos(angle), y: cy + cellSize * Math.sin(angle) }));
      }
      for (let i = 0; i < 6; i++) addEdge(corners[i], corners[(i + 1) % 6]);
    }
  }

  const result = [];
  for (const [p1, p2] of edgeMap.values()) {
    result.push(...clipSegmentToPolygon(p1, p2, polygon));
  }
  return result;
}

/**
 * Build a merged strut-lattice BufferGeometry for one face's star, mapping
 * the clipped hex-grid edges back into world space through the same
 * (U, W, N) frame + radial bulge profile the star outline uses. When
 * `thickness` > 0 each strut is extruded into a box (top, bottom, and two
 * side walls, each with its own vertices so edges stay crisp) so the fill
 * reads as a real perforated sheet with visible edge thickness rather than
 * a zero-thickness film.
 *
 * @param {Face} face
 * @param {{outline2D: {u:number,w:number}[]}} star
 * @param {object} params bulgeStrength, tipDipStrength, thickness, plus cellSize/strutWidth overrides
 * @returns {THREE.BufferGeometry}
 */
export function buildHexGrid(face, star, params) {
  const {
    cellFraction = 0.22,
    strutWidth = 0.015,
    bulgeStrength = 0,
    tipDipStrength = 0,
    thickness = 0,
    jitter = 0,
    junctionSink = 0,
    sinkNear = 0,
    sinkFar = 0,
  } = params;
  const cellSize = face.R_out * cellFraction;
  const polygon = star.outline2D.map((p) => ({ x: p.u, y: p.w }));
  const edges = hexGridEdges(polygon, cellSize, jitter);
  const halfT = thickness / 2;

  // Star tips sit at the even indices of the 10-point outline. Fill points
  // near a tip sink radially with the tube's own falloff (full inside
  // sinkNear of a tip, zero beyond sinkFar - both world distances derived
  // from the tube's parameter-space profile), so the fill sheet dips into
  // the sculpture together with the tube ends and ribbon endpoints instead
  // of staying at the surface and hiding them.
  const tips2D = star.outline2D.filter((_, i) => i % 2 === 0);
  const sinkAt = (u, w) => {
    if (!junctionSink) return 0;
    let d = Infinity;
    for (const t of tips2D) d = Math.min(d, Math.hypot(u - t.u, w - t.w));
    return junctionSink * (1 - smoothstep(sinkNear, sinkFar, d));
  };

  const place = (u, w) => {
    const r2 = Math.sqrt(u * u + w * w);
    const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(r2 / face.R_out, 2)) : 0;
    const world = face.center.clone().addScaledVector(face.U, u).addScaledVector(face.W, w).addScaledVector(face.normal, bulge);
    applyTipDip(world, r2, face, tipDipStrength);
    const sink = sinkAt(u, w);
    if (sink) world.addScaledVector(world.clone().normalize(), -sink);
    return world;
  };

  const positions = [];
  const indices = [];
  let vi = 0;

  const pushQuad = (q1, q2, q3, q4) => {
    positions.push(q1.x, q1.y, q1.z, q2.x, q2.y, q2.z, q3.x, q3.y, q3.z, q4.x, q4.y, q4.z);
    indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
    vi += 4;
  };

  for (const [p1, p2] of edges) {
    const a = place(p1.x, p1.y);
    const b = place(p2.x, p2.y);
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    // With jitter active, vary each strut's width too (deterministically,
    // from its midpoint) - membrane-like tissue rather than uniform wire.
    let widthScale = 1;
    if (jitter) {
      const mx = Math.round(((p1.x + p2.x) / 2 / cellSize) * 50);
      const my = Math.round(((p1.y + p2.y) / 2 / cellSize) * 50);
      widthScale = 0.6 + 0.8 * hash2(mx + 31337, my - 271);
    }
    const perp = dir.clone().cross(face.normal).normalize().multiplyScalar(strutWidth * widthScale);

    const p1a = a.clone().add(perp);
    const p1b = a.clone().sub(perp);
    const p2a = b.clone().add(perp);
    const p2b = b.clone().sub(perp);

    if (halfT > 0) {
      // Local sheet normal for the extrusion: perpendicular to both the
      // strut direction and its in-sheet width direction.
      const up = new THREE.Vector3().crossVectors(perp, dir).normalize().multiplyScalar(halfT);
      pushQuad(p1a.clone().add(up), p1b.clone().add(up), p2a.clone().add(up), p2b.clone().add(up));
      pushQuad(p1b.clone().sub(up), p1a.clone().sub(up), p2b.clone().sub(up), p2a.clone().sub(up));
      pushQuad(p1a.clone().sub(up), p1a.clone().add(up), p2a.clone().sub(up), p2a.clone().add(up));
      pushQuad(p1b.clone().add(up), p1b.clone().sub(up), p2b.clone().add(up), p2b.clone().sub(up));
    } else {
      pushQuad(p1a, p1b, p2a, p2b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
