// Generates a seamlessly-tileable canvas texture of the same jittered,
// organic cellular pattern `hexgrid.js` builds as real 3D geometry for the
// star's interior fill - irregular polygon cells with varying strut widths,
// reading like coral / bone tissue / a Voronoi diagram - rendered as a 2D
// relief pattern so the ribbons (which twist too much along their length to
// carry literal cell geometry) still read as the same material.
//
// The tile spans several cells (not one) so the irregularity is visible,
// and every vertex offset / edge width is hashed from the vertex's position
// *wrapped modulo the tile size*, so cells crossing the tile border land
// identically on both sides - seamless under RepeatWrapping.

import * as THREE from 'three';
import { hash2 } from './hexgrid.js';

export const TEXTURE_COLS = 4; // hex columns per tile
const TEXTURE_ROWS = 8; // hex rows per tile (must be even to wrap)

/**
 * @param {object} [options]
 * @param {number} [options.cellPx=24] hex "radius" in canvas pixels
 * @param {number} [options.lineWidth=3] base stroke width in canvas pixels
 * @param {number} [options.jitter=0] vertex displacement as a fraction of cellPx
 * @returns {THREE.CanvasTexture}
 */
export function createHexTexture({ cellPx = 24, lineWidth = 3, jitter = 0 } = {}) {
  const colStep = Math.sqrt(3) * cellPx;
  const rowStep = 1.5 * cellPx;
  const width = Math.round(TEXTURE_COLS * colStep);
  const height = Math.round(TEXTURE_ROWS * rowStep);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';

  const wrap = (v, m) => ((v % m) + m) % m;
  const hashAt = (x, y, salt) => {
    // Quantize the wrapped position to 0.1px so shared corners (and border
    // copies exactly one tile apart) hash identically.
    const ix = Math.round(wrap(x, width) * 10) + salt;
    const iy = Math.round(wrap(y, height) * 10) - salt;
    return hash2(ix, iy);
  };
  const jitterCorner = (p) => {
    if (!jitter) return p;
    const angle = hashAt(p.x, p.y, 0) * Math.PI * 2;
    const mag = (0.35 + 0.65 * hashAt(p.x, p.y, 7919)) * jitter * cellPx;
    return { x: p.x + Math.cos(angle) * mag, y: p.y + Math.sin(angle) * mag };
  };

  for (let row = -1; row <= TEXTURE_ROWS; row++) {
    const cy = row * rowStep;
    const xOffset = row % 2 !== 0 ? colStep / 2 : 0;
    for (let col = -1; col <= TEXTURE_COLS; col++) {
      const cx = col * colStep + xOffset;
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        corners.push(jitterCorner({ x: cx + cellPx * Math.cos(angle), y: cy + cellPx * Math.sin(angle) }));
      }
      for (let i = 0; i < 6; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        const widthScale = jitter
          ? 0.6 + 0.8 * hashAt((a.x + b.x) / 2, (a.y + b.y) / 2, 31337)
          : 1;
        ctx.lineWidth = lineWidth * widthScale;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Seamlessly-tileable PERFORATION texture: solid (white) material with a
 * hole (black) punched in each hex cell's middle. Meant to be used as an
 * alphaMap with alphaTest so the holes read as real cut-outs (light passes
 * through), the way the reference lamps' surfaces are drilled - the
 * inverse figure/ground of `createHexTexture`, which draws thin strut
 * LINES on a dark background.
 *
 * With `jitter` > 0 the cells deform into irregular organic polygons and
 * every hole's size varies a little - the "coral" pattern - using the same
 * wrapped-position hashing as `createHexTexture` so the tile stays
 * seamless under RepeatWrapping.
 *
 * @param {object} [options]
 * @param {number} [options.cellPx=28] hex "radius" in canvas pixels
 * @param {number} [options.holeFrac=0.24] hole size, 0..0.45 (same scale as the earlier hex-web study's "HEX HOLE SIZE")
 * @param {number} [options.jitter=0] vertex displacement as a fraction of cellPx (~0.45 for coral)
 * @returns {THREE.CanvasTexture}
 */
export function createPerforationTexture({ cellPx = 28, holeFrac = 0.24, jitter = 0 } = {}) {
  const colStep = Math.sqrt(3) * cellPx;
  const rowStep = 1.5 * cellPx;
  const width = Math.round(TEXTURE_COLS * colStep);
  const height = Math.round(TEXTURE_ROWS * rowStep);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';

  const wrap = (v, m) => ((v % m) + m) % m;
  const hashAt = (x, y, salt) => {
    const ix = Math.round(wrap(x, width) * 10) + salt;
    const iy = Math.round(wrap(y, height) * 10) - salt;
    return hash2(ix, iy);
  };
  const jitterCorner = (p) => {
    if (!jitter) return p;
    const angle = hashAt(p.x, p.y, 0) * Math.PI * 2;
    const mag = (0.35 + 0.65 * hashAt(p.x, p.y, 7919)) * jitter * cellPx;
    return { x: p.x + Math.cos(angle) * mag, y: p.y + Math.sin(angle) * mag };
  };

  // holeFrac 0..0.45 maps to the hole polygon's scale about its (jittered)
  // cell centroid; 0.45 stops short of 1 so struts never fully vanish.
  const holeScale = Math.min(Math.max(holeFrac, 0), 0.45) / 0.45 * 0.86;

  for (let row = -1; row <= TEXTURE_ROWS; row++) {
    const cy = row * rowStep;
    const xOffset = row % 2 !== 0 ? colStep / 2 : 0;
    for (let col = -1; col <= TEXTURE_COLS; col++) {
      const cx = col * colStep + xOffset;
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        corners.push(jitterCorner({ x: cx + cellPx * Math.cos(angle), y: cy + cellPx * Math.sin(angle) }));
      }
      const centroid = corners.reduce((acc, c) => ({ x: acc.x + c.x / 6, y: acc.y + c.y / 6 }), { x: 0, y: 0 });
      // Per-cell hole-size variation for the organic look (deterministic).
      const sizeScale = jitter ? 0.75 + 0.5 * hashAt(centroid.x, centroid.y, 104729) : 1;
      const s = holeScale * sizeScale;
      if (s <= 0.01) continue;
      ctx.beginPath();
      corners.forEach((c, i) => {
        const hx = centroid.x + (c.x - centroid.x) * s;
        const hy = centroid.y + (c.y - centroid.y) * s;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
