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

/**
 * Continuous meandering ridge/valley "maze" pattern inspired by brain-coral
 * (Diploria) surface texture, per a user-supplied reference photo - real
 * brain coral has no discrete cells at all, just winding grooves between
 * raised ridges, with a scatter of tiny corallite pits. Built from a
 * domain-warped sine-interference field (a cheap reaction-diffusion-style
 * "worm pattern") instead of `createPerforationTexture`'s polygon grid -
 * `v = sin(ridge freq * warped x) + sin(ridge freq * warped y)`, threshold
 * a thin band around `v = 0` for the groove. Every sin() term's frequency
 * is an INTEGER multiple of 1/width or 1/height, so each term - and the
 * warp built the same way feeding into it - is already exactly periodic
 * across the tile; no explicit seam-matching needed for RepeatWrapping.
 *
 * The grooves stay well above the alphaTest cutoff (shaded, not punched -
 * they're relief, not holes) so the surface stays structurally solid; a
 * separate sparse scatter of small round pores IS punched fully through
 * (true alpha holes), the same wrapped-position hash scatter the other
 * patterns use, for the tiny pits visible in the reference.
 *
 * `warpAmp` feeds into the SAME sin() term `ridgeFreq` multiplies, so its
 * effective contribution to the field is `ridgeFreq * warpAmp` cycles worth
 * of extra phase, not `warpAmp` alone - at the first values tried (0.35-0.55)
 * that worked out to 2-4 extra full cycles of warp on top of the base ridge
 * frequency, which produced a dense, aliased hatching mess instead of a
 * smooth meander (confirmed by rendering the raw canvas standalone and
 * comparing against the reference photo). Keeping `ridgeFreq * warpAmp`
 * under ~1 is what actually reads as an organic wobble on top of the base
 * frequency rather than a second, higher one fighting it.
 *
 * @param {object} [options]
 * @param {number} [options.cellPx=44] sets canvas resolution only - no discrete cells are drawn
 * @param {number} [options.ridgeFreq=6] meanders per tile - lower reads as wider, coarser channels
 * @param {number} [options.warpAmp=0.1] domain-warp strength - keep `ridgeFreq * warpAmp` under ~1 or the field aliases into fine hatching instead of a smooth meander
 * @param {number} [options.poreFrac=0.08] fraction of candidate pore sites actually punched as real holes
 * @returns {THREE.CanvasTexture}
 */
export function createCoralMazeTexture({ cellPx = 44, ridgeFreq = 6, warpAmp = 0.1, poreFrac = 0.08 } = {}) {
  const colStep = Math.sqrt(3) * cellPx;
  const rowStep = 1.5 * cellPx;
  const width = Math.round(TEXTURE_COLS * colStep);
  const height = Math.round(TEXTURE_ROWS * rowStep);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);

  const TWO_PI = Math.PI * 2;
  const kx = ridgeFreq;
  // Matches the ridge spacing in x/y despite the canvas itself not being
  // square (TEXTURE_COLS != TEXTURE_ROWS) - without this the maze reads as
  // visibly stretched.
  const ky = Math.round(ridgeFreq * (height / width)) || ridgeFreq;
  const warpKx = 2;
  const warpKy = 3; // low frequency so the warp reads as organic drift, not a second grid

  for (let py = 0; py < height; py++) {
    const y = py / height;
    for (let px = 0; px < width; px++) {
      const x = px / width;
      const wx = warpAmp * Math.sin(TWO_PI * (warpKx * x + warpKy * y));
      const wy = warpAmp * Math.sin(TWO_PI * (warpKy * x - warpKx * y));
      const v = Math.sin(TWO_PI * kx * (x + wx)) + Math.sin(TWO_PI * ky * (y + wy));
      // v spans roughly -2..2; a thin band around 0 is the groove.
      const grooveT = Math.max(0, 1 - Math.abs(v) / 0.55);
      const shade = 235 - grooveT * 90; // 235 (ridge top) down to ~145 (groove floor) - stays well above alphaTest*255
      const idx = (py * width + px) * 4;
      img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = shade;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Sparse true perforations - the tiny corallite pits.
  const poreCellPx = cellPx * 0.55;
  const poreCols = Math.ceil(width / poreCellPx);
  const poreRows = Math.ceil(height / poreCellPx);
  ctx.fillStyle = '#000';
  const wrap = (v, m) => ((v % m) + m) % m;
  for (let row = -1; row <= poreRows; row++) {
    for (let col = -1; col <= poreCols; col++) {
      const cx0 = col * poreCellPx;
      const cy0 = row * poreCellPx;
      const hx = Math.round(wrap(cx0, width) * 10);
      const hy = Math.round(wrap(cy0, height) * 10);
      if (hash2(hx, hy) > poreFrac) continue;
      const jx = (hash2(hx, hy + 1) - 0.5) * poreCellPx * 0.7;
      const jy = (hash2(hx + 1, hy) - 0.5) * poreCellPx * 0.7;
      const r = poreCellPx * (0.12 + 0.1 * hash2(hx + 2, hy + 2));
      ctx.beginPath();
      ctx.arc(cx0 + poreCellPx / 2 + jx, cy0 + poreCellPx / 2 + jy, r, 0, TWO_PI);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
