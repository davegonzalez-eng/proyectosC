// Builds a thin, double-sided "shield" surface filling a star's interior,
// so the star can read as a solid faceted panel instead of an open
// wireframe outline. Shares its boundary vertices with the star's tube
// curve (same distorted outline points), so the membrane's edge sits flush
// against the inside of the tube with no gap or seam.

import * as THREE from 'three';

/**
 * @param {{outline: THREE.Vector3[], outline2D: {u:number, w:number}[]}} star
 * @returns {THREE.BufferGeometry}
 */
export function buildMembrane(star) {
  const contour = star.outline2D.map((p) => new THREE.Vector2(p.u, p.w));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);

  const positions = new Float32Array(star.outline.length * 3);
  star.outline.forEach((p, i) => {
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  });

  const indices = new Uint32Array(triangles.length * 3);
  triangles.forEach(([a, b, c], i) => {
    indices[i * 3 + 0] = a;
    indices[i * 3 + 1] = b;
    indices[i * 3 + 2] = c;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  return geometry;
}
