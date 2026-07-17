// Builds a hexagonal-grid lattice filling a star's interior, as an
// alternative to the solid membrane fill: a pointy-top hex grid is tiled
// over the star's local 2D (u, w) coordinates, clipped to the star's
// (possibly concave) outline, and each surviving strut is turned into a
// thin flat quad in 3D following the same bulge-along-normal profile as
// the star itself, so the lattice sits on the same curved surface.

import * as THREE from 'three';

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
 * Edges of a pointy-top hex grid covering `polygon`'s bounding box, clipped
 * to the polygon and de-duplicated so shared edges between adjacent hexes
 * are only returned once.
 *
 * @param {{x:number,y:number}[]} polygon
 * @param {number} cellSize hex "radius" (center to corner)
 * @returns {[{x,y},{x,y}][]}
 */
export function hexGridEdges(polygon, cellSize) {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const colStep = Math.sqrt(3) * cellSize;
  const rowStep = 1.5 * cellSize;
  const rows = Math.ceil((maxY - minY) / rowStep) + 2;
  const cols = Math.ceil((maxX - minX) / colStep) + 2;

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
        corners.push({ x: cx + cellSize * Math.cos(angle), y: cy + cellSize * Math.sin(angle) });
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
 * (U, W, N) frame + radial bulge profile the star outline uses.
 *
 * @param {Face} face
 * @param {{outline2D: {u:number,w:number}[]}} star
 * @param {object} params bulgeStrength, plus cellSize/strutWidth overrides
 * @returns {THREE.BufferGeometry}
 */
export function buildHexGrid(face, star, params) {
  const { cellFraction = 0.22, strutWidth = 0.015, bulgeStrength = 0 } = params;
  const cellSize = face.R_out * cellFraction;
  const polygon = star.outline2D.map((p) => ({ x: p.u, y: p.w }));
  const edges = hexGridEdges(polygon, cellSize);

  const place = (u, w) => {
    const r2 = Math.sqrt(u * u + w * w);
    const bulge = bulgeStrength ? bulgeStrength * (1 - Math.pow(r2 / face.R_out, 2)) : 0;
    return face.center.clone().addScaledVector(face.U, u).addScaledVector(face.W, w).addScaledVector(face.normal, bulge);
  };

  const positions = [];
  const indices = [];
  let vi = 0;

  for (const [p1, p2] of edges) {
    const a = place(p1.x, p1.y);
    const b = place(p2.x, p2.y);
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    const perp = dir.clone().cross(face.normal).normalize().multiplyScalar(strutWidth);

    const p1a = a.clone().add(perp);
    const p1b = a.clone().sub(perp);
    const p2a = b.clone().add(perp);
    const p2b = b.clone().sub(perp);

    positions.push(p1a.x, p1a.y, p1a.z, p1b.x, p1b.y, p1b.z, p2a.x, p2a.y, p2a.z, p2b.x, p2b.y, p2b.z);
    indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
    vi += 4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
