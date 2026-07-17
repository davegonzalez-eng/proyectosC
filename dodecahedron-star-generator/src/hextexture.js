// Generates a small, seamlessly-tileable canvas texture of hexagon
// outlines - the same pointy-top hex tiling `hexgrid.js` builds as real 3D
// geometry for the star's interior fill, rendered here as a 2D pattern so
// the ribbons (which can't sensibly carry actual hex-grid geometry along a
// twisting strip) can still read as "the same texture."

import * as THREE from 'three';

/**
 * @param {object} [options]
 * @param {number} [options.cellPx=48] hex "radius" in canvas pixels
 * @param {number} [options.lineWidth=3] stroke width in canvas pixels
 * @returns {THREE.CanvasTexture}
 */
export function createHexTexture({ cellPx = 48, lineWidth = 3 } = {}) {
  const colStep = Math.sqrt(3) * cellPx; // horizontal period
  const rowStep = 1.5 * cellPx; // one row step; full vertical period is 2x this
  const width = Math.round(colStep);
  const height = Math.round(rowStep * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';

  const drawHexAt = (cx, cy) => {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + cellPx * Math.cos(angle);
      const y = cy + cellPx * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  // Draw a border of extra copies around the tile so hexagons crossing the
  // tile's edge are captured on both sides, giving a seamless wrap.
  for (let row = -1; row <= 2; row++) {
    const cy = row * rowStep;
    const xOffset = row % 2 !== 0 ? colStep / 2 : 0;
    for (let col = -1; col <= 2; col++) {
      const cx = col * colStep + xOffset;
      drawHexAt(cx, cy);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
