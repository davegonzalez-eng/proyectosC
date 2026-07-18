// Builds a thin "shield" surface filling a star's interior, so the star can
// read as a solid faceted panel instead of an open wireframe outline.
// Shares its boundary vertices with the star's tube curve (same distorted
// outline points), so the membrane's edge sits flush against the inside of
// the tube with no gap or seam. With `thickness` > 0 the panel becomes two
// parallel layers offset along the face normal - the edge gap between them
// is hidden inside the tube, so no side wall is needed.

import * as THREE from 'three';

/**
 * @param {{outline: THREE.Vector3[], outline2D: {u:number, w:number}[]}} star
 * @param {{normal: THREE.Vector3}|null} [face] face whose normal to extrude along (required when thickness > 0)
 * @param {number} [thickness=0] full slab thickness in world units
 * @returns {THREE.BufferGeometry}
 */
export function buildMembrane(star, face = null, thickness = 0) {
  const contour = star.outline2D.map((p) => new THREE.Vector2(p.u, p.w));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);

  const layers = thickness > 0 && face ? [thickness / 2, -thickness / 2] : [0];
  const n = star.outline.length;

  const positions = new Float32Array(n * layers.length * 3);
  layers.forEach((offset, li) => {
    star.outline.forEach((p, i) => {
      const base = (li * n + i) * 3;
      positions[base + 0] = p.x + (face ? face.normal.x * offset : 0);
      positions[base + 1] = p.y + (face ? face.normal.y * offset : 0);
      positions[base + 2] = p.z + (face ? face.normal.z * offset : 0);
    });
  });

  const indices = [];
  layers.forEach((_, li) => {
    const base = li * n;
    for (const [a, b, c] of triangles) {
      // Flip winding on the lower layer so both faces point outward.
      if (li === 0) indices.push(base + a, base + b, base + c);
      else indices.push(base + a, base + c, base + b);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}
