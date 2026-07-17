# Dodecahedron Star Generator — a Quin study

An interactive, browser-based tool for building a Bathsheba-Grossman-"Quin"-style
sculpture study: a regular dodecahedron whose 12 pentagonal faces each carry a
swirled, "waving" 5-pointed star, with user-specified ribbon connectors linking
star arms across faces into a single lattice.

Open `index.html` through a local static server (ES modules need `http://`,
not `file://`):

```
cd dodecahedron-star-generator
python3 -m http.server 8080
# then open http://localhost:8080
```

No build step and no CDN dependency — Three.js is vendored under `vendor/three/`.

## The plan

### 1. Base solid: regular dodecahedron

Built as the polar dual of a regular icosahedron (`src/geometry.js:buildDodecahedron`):

- 12 icosahedron vertices → 12 dodecahedron **faces**
- 20 icosahedron faces (their centroids, normalized to the sphere) → 20 dodecahedron **vertices**
- Each dodecahedron face gets a local orthonormal frame `(U, W, N)`: `N` is the
  outward face normal, `U` points at the face's own vertex 0, `W = N × U`. All
  star geometry is authored as flat 2D `(u, w)` coordinates in this frame, then
  mapped to world space — this is the seam where a face could later be swapped
  for a curved/printed patch without touching any of the star math.

Verified numerically: all 12 faces are regular pentagons of equal circumradius,
corners land at exact 72° spacing, and the 20 shared vertices each belong to
exactly 3 faces (correct dodecahedral topology).

### 2. Labeling

- Faces: `F0`–`F11`, labeled at the face center.
- Star arms (the 5 outer tips of each face's star): `F<face>-A0`…`F<face>-A4`,
  in the same counter-clockwise order as the pentagon's own corners (arm `A0`
  always sits at the face's vertex 0).

This `F#-A#` naming is the addressing scheme used everywhere else in the tool:
typed connections, click-to-pick, and status messages all speak it.

### 3. Star shape

Each face gets a classic 10-point pentagram outline: 5 outer tips (the arms,
radius ≈ `R_out`, the pentagon's own circumradius) alternating with 5 inner
concave points (radius `R_out / φ² ≈ 0.382·R_out`, the standard pentagram
ratio). Built in `buildStar()`.

### 4. Swirl (counter-clockwise)

Each point at local radius `r` and angle `θ` is rotated by an amount that
grows with radius:

```
θ' = θ + swirl · (r / R_out)      // swirl in radians, positive = CCW
```

So the star's center stays put while its outline twists more the further out
you go — a simple, controllable "pinwheel" distortion. Exposed as the **Swirl**
slider (0–90°, default 25°).

### 4b. Arm-axis twist (blade twist)

A second, independent rotation layered on top of the in-plane swirl: each
arm's outline points (its tip and the trailing inner point) are rotated about
that specific arm's *own* outward axis — the line from the face center
through that arm's undistorted vertex — by an angle growing with radius,
exactly like the in-plane swirl formula but around a different axis:

```
offset' = offset.applyAxisAngle(armAxis_i, armTwist · (r2 / R_out))
```

Since that axis lies *in* the face plane rather than along the face normal,
rotating around it banks each arm out of the plane as it extends from center
to tip — like a propeller blade twisting along its own length, five
independent blades per star. Exposed as the **Arm-axis twist** slider
(0–90°, default 20°).

### 5. Waving (radial distortion)

After swirling, the radius itself is rippled:

```
r' = r2 + (r2 / k) · sin(k · r2)
```

where `r2` is the point's *original*, undistorted distance to the star's
center in the face plane (per the spec — swirl and wave are both independent
functions of `r2`, not of each other's output). `k` controls both the ripple
frequency and (inversely) its amplitude; default `k = 5.4`. Exposed as the
**Wave k** slider, with a checkbox to disable the wave entirely and see the
plain swirled star.

### 6. Curving the faces (forward-looking hook)

The brief notes the flat pentagon faces are stand-ins for eventually-curved
surfaces. Rather than leave that as a TODO, each face point also takes an
optional dome displacement along the face normal:

```
bulge = bulgeStrength · (1 − (r2 / R_out)²)
```

i.e. maximal at the star's center, zero at the pentagon's rim (so neighboring
faces still meet cleanly at shared edges). Default `bulgeStrength = 0.41`.
A true printable/cast curved-surface export is out of scope for this pass.

### 7. Ribbon connectors

Given two arm labels, `src/ribbon.js:buildRibbon()` connects their tip
positions with a cubic Bézier. Each control point first follows that tip's
own outward direction a short distance (so the ribbon reads as a
continuation of the arm), then is pulled *inward*, toward the sphere's
center, well past the control point's own radius — so the bulk of the curve
passes **under** the surrounding stars, at a lower radius than the surface
geometry, instead of arcing above it. It's a woven, over-under look rather
than tendrils floating over the body.

A twisted flat strip is then built along that curve using Frenet frames plus
a continuously increasing twist angle (**Ribbon twist** slider, in full
turns; default **0.5**, i.e. a single half-turn — kept low on purpose so the
strip doesn't fight itself visually along the length of 60 simultaneous
ribbons). Ends are tapered to a near-point so they blend into the star's
tube instead of showing a flat cut face.

### 8. Specifying connections

The **Manual ribbon connections** box accepts free-form text — the parser
simply scans for `F<n>-A<n>` tokens (any separator: `:`, `->`, commas,
newlines, whitespace) and pairs them up in order, e.g.:

```
F0-A2:F5-A1, F2-A3:F9-A0
F1-A0 -> F7-A3
```

Invalid tokens (bad face/arm index) or a trailing unmatched arm are reported
in the status line instead of silently dropped. As a faster alternative to
typing, **click any two arm markers in the 3D view** — the first click is
highlighted red and the second one appends `A:B` to the text box and redraws
automatically.

### 9. Auto-connect adjacent faces

The **Auto-connect adjacent faces** checkbox generates a full set of
"neighbor" ribbons from a single combinatorial rule, reverse-engineered from
a reference set of 5 connections onto face 7:

```
F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1
```

For face `F` and arm `m`, take the edge of `F` between its vertices `(m+1)`
and `(m+2)` (mod 5). That edge is shared with exactly one neighbor face `G`.
Connect `F`'s arm `m` to `G`'s arm at that shared `(m+2)` vertex
(`computeAdjacentFaceConnections()` in `src/geometry.js`). Applied to all 12
faces × 5 arms this produces **60 unique ribbons**, with every one of the 60
arms touched by exactly two of them — verified to reproduce the reference
set exactly when `F = 7`. Manual connections from the text box are kept and
merged (de-duplicated) with the auto-generated set.

### 10. Membrane mode

The **Fill star interior (thin surface)** checkbox triangulates each star's
10-point outline (`THREE.ShapeUtils.triangulateShape` on the same local 2D
`(u, w)` coordinates used to place the outline, via `src/membrane.js`) and
renders it as a thin double-sided panel. Because it's built from the exact
same (already swirled/waved/twisted/bulged) points the tube is drawn
through, its edge sits flush against the inside of the tube with no seam.

### 11. Materials

A single `MeshStandardMaterial` is shared across the stars, ribbons, and
membranes (so the piece reads as one cast/printed material, not mixed
parts), switchable from the **Material** dropdown:

- **Bronze** — warm gold, metalness 0.75, roughness 0.32 (the original look)
- **Titanium** — cool grey, metalness 0.9, roughness 0.45 (brushed, not mirror-like)
- **Metallized (chrome)** — near-white, metalness 1.0, roughness 0.08

A generated `RoomEnvironment` (via `THREE.PMREMGenerator`, no external HDRI
needed) is set as `scene.environment` so the metallic presets — especially
the near-mirror chrome one — actually show reflections instead of reading
flat and dark.

## File layout

```
index.html            page shell, control panel, import map
src/geometry.js        dodecahedron construction, per-face star math, adjacency-connection rule
src/ribbon.js          twisted ribbon geometry (dips under the surface) between two arm tips
src/membrane.js         thin triangulated fill surface for a star's interior
src/main.js             Three.js scene, materials/environment, UI wiring, labels, picking, render loop
vendor/three/           vendored Three.js build + OrbitControls + CSS2DRenderer + RoomEnvironment (no CDN/network dependency)
```

## Verified

- Geometry math checked standalone under Node (`buildDodecahedron`/`buildStar`):
  12 equal-circumradius pentagon faces, exact 72° corner spacing, 20 vertices
  each shared by exactly 3 faces.
- `computeAdjacentFaceConnections()` checked standalone under Node: exactly
  reproduces the 5-pair face-7 reference set, and generalizes to 60 unique
  pairs with every arm at degree 2.
- Star outline triangulation (`buildMembrane`) checked standalone: an 8-triangle
  fan from the 10-point star outline, as expected for a simple decagon.
- Full app checked in headless Chromium: renders with zero console errors;
  every slider (swirl/arm-twist/k/bulge/tube radius/twist) and toggle
  (membrane, auto-connect, material) visibly does what it says, including
  chrome/titanium reflections from the generated environment.

## Possible next steps

- Export the lattice (stars + ribbons) as a single manifold mesh (STL/OBJ) for
  3D printing or CNC.
- Replace the flat-face + bulge approximation with a true curved parametric
  surface per face for a printable Quin-accurate shell.
- Per-face swirl/k overrides (currently global) for asymmetric compositions.
