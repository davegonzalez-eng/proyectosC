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
slider (0–90°, default 23°).

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
(0–90°, default **0°** — off by default; dial it in for a more organic,
less symmetric look).

### 5. Waving (radial distortion)

After swirling, the radius itself is rippled:

```
r' = r2 + (r2 / k) · sin(k · r2)
```

where `r2` is the point's *original*, undistorted distance to the star's
center in the face plane (per the spec — swirl and wave are both independent
functions of `r2`, not of each other's output). `k` controls both the ripple
frequency and (inversely) its amplitude; default `k = 5`. Exposed as the
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
faces still meet cleanly at shared edges). Default `bulgeStrength = 0.5`.
A true printable/cast curved-surface export is out of scope for this pass.

### 7. Ribbon connectors

Given two arm labels, `src/ribbon.js:buildRibbon()` threads their tip
positions onto a 5-point Catmull-Rom spline: `tip → leave point → dip point →
leave point → tip`. Catmull-Rom passes exactly through every one of those
points (unlike Bézier control points, which only pull the curve without
touching it), which buys two precise guarantees:

- **Continues the arm's own trend, not a reset direction.** Each "leave"
  point sits a short distance along that tip's *actual tangent*
  (`buildStar()` samples the arm's own curve a hair before the tip via
  finite difference, so it captures however swirl/wave/bulge/arm-twist are
  already bending it) rather than the tip's purely-radial `outDir`. Since
  the bulge is falling back to the flat rim right as `r` approaches
  `R_out`, the arm is typically already trending toward a lower radius
  right before the tip — the ribbon picks up exactly that trend instead of
  first shooting outward along `outDir` and only then diving inward.
  (Verified numerically: tangent misalignment at the join is under 0.4°
  across all 20 ribbons, versus a visible kink before this change.)
- **Exact dip depth.** The middle "dip" point is placed at a precise target
  radius from the sculpture's center: `depthFraction × avgRadius`, where
  `avgRadius` is the average of the two tips' own distance from center.
  Default `depthFraction = 0.8` — the ribbon's lowest point sits at 80% of
  the face's radius. (Verified numerically: min/max depth ratio across all
  20 ribbons is exactly 0.800.) Tunable via the **Ribbon depth** slider
  (50–100%).

The cross-section also blends smoothly: its half-width starts at
`tubeRadius` (matching the star tube's own thickness) right at each tip and
widens to the full ribbon width only in the middle, so there's no jump in
apparent thickness at the join — no more thin thread poking out of a fat
tube. A twisted flat strip is then built along the curve using Frenet frames
plus a continuously increasing twist angle (**Ribbon twist** slider, in full
turns; default **0.5**, a single half-turn — kept low so the strip doesn't
fight itself visually across many simultaneous ribbons).

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

### 9. Adjacent-face connections (always on)

`src/geometry.js:computeAdjacentFaceConnections()` generates the sculpture's
"neighbor" ribbons from a single combinatorial rule, reverse-engineered from
a reference set of 5 connections onto face 7:

```
F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1
```

**The rule.** For face `F` and arm `m`, take the edge of `F` between its
vertices `(m+1)` and `(m+2)` (mod 5). That edge is shared with exactly one
neighbor face `G`. `F`'s arm `m` connects to `G`'s arm at that shared
`(m+2)` vertex.

**Why it can't just be applied to all 60 arms.** Doing that (every face,
every arm, unconditionally) is the tool's earlier behavior, and it always
decomposes into **20 disjoint triangles of 3 arms each** — a structural fact
of this specific rule, verified by tracing its cycles, not a bug. A triangle
graph can have at most one matched edge (any edge uses 2 of its 3 vertices,
and the third can't be added without reusing one), so getting "each arm
connected once" is only possible by keeping *one* edge per triangle and
accepting that the third arm in each triangle gets no ribbon.

**Which edge to keep.** All 5 of the given face-7 pairs turn out to be
exactly face 7's own 5 rule outputs — i.e. in every triangle that includes
face 7, face 7's edge is the one that's kept. To reproduce that generally,
face 7 is processed *first*: its 5 edges are claimed unconditionally before
any other face gets a turn. The remaining 11 faces are then processed in
ascending order, each claiming its own rule output for a given arm only if
neither endpoint has already been claimed by an earlier face.

**Result:** exactly **20 ribbons**, covering 40 of the 60 arms; every
connected arm is touched exactly once (verified numerically). The other 20
arms (one per triangle) have no auto-generated connection — you can still
wire any of them up manually below. This is always on; there's no toggle
for it. Manual connections from the text box are merged in
(de-duplicated) on top of this fixed set.

### 10. Filling the star interior: solid membrane or hex grid

Two mutually-exclusive checkboxes (checking one unchecks the other):

- **Fill star interior (thin surface)** triangulates each star's 10-point
  outline (`THREE.ShapeUtils.triangulateShape` on the same local 2D `(u, w)`
  coordinates used to place the outline, via `src/membrane.js`) into a thin
  double-sided panel.
- **Fill star interior (hex grid)** (`src/hexgrid.js`) tiles a pointy-top
  hexagonal grid across the same local 2D coordinates, clips each hex edge
  against the star's (concave) outline using a generic segment/polygon
  clip - not just an inside/outside test, so partial cells along the
  boundary are cut cleanly rather than dropped or left overhanging - and
  turns every surviving strut into a thin quad in 3D, following the star's
  own bulge-along-normal profile. Cell size is tunable via the **Hex cell
  size** slider.

Both modes are built from the exact same (already swirled/waved/twisted/
bulged) points the tube is drawn through, so their boundary sits flush
against the inside of the tube with no seam.

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
src/ribbon.js          spline-based ribbon geometry (precise dip depth + tangent-matched joins) between two arm tips
src/membrane.js         thin triangulated fill surface for a star's interior
src/hexgrid.js           clipped hexagonal-grid fill surface for a star's interior
src/main.js             Three.js scene, materials/environment, UI wiring, labels, picking, render loop
vendor/three/           vendored Three.js build + OrbitControls + CSS2DRenderer + RoomEnvironment (no CDN/network dependency)
```

## Verified

- Geometry math checked standalone under Node (`buildDodecahedron`/`buildStar`):
  12 equal-circumradius pentagon faces, exact 72° corner spacing, 20 vertices
  each shared by exactly 3 faces.
- `computeAdjacentFaceConnections()` checked standalone under Node in stages:
  (1) the raw per-arm rule applied to all 60 arms decomposes into exactly 20
  cycles of length 3 (verified by tracing); (2) the face-7-first greedy
  reduction yields exactly 20 pairs, all 5 reference pairs present, and
  every connected arm at degree exactly 1 (min = max = 1 across all 40
  connected arms).
- `buildRibbon()` checked standalone under Node across all 20 connection
  pairs with the new defaults: depth ratio (min radius along the curve ÷
  average endpoint radius) is exactly 0.800 in every case, and worst-case
  tangent misalignment between the curve's initial tangent and the tip's
  own arm-tangent is 0.36°.
- Star outline triangulation (`buildMembrane`) and hex-grid clipping
  (`buildHexGrid`) checked standalone: expected triangle counts, no NaNs.
- Full app checked in headless Chromium: renders with zero console errors;
  every slider (swirl/arm-twist/k/bulge/tube radius/twist/ribbon depth/hex
  cell size) and toggle (membrane, hex grid, material) visibly does what it
  says, including mutual exclusion between the two fill modes and
  chrome/titanium reflections from the generated environment; the
  adjacent-face connections render unconditionally with no checkbox.

## Possible next steps

- Export the lattice (stars + ribbons) as a single manifold mesh (STL/OBJ) for
  3D printing or CNC.
- Replace the flat-face + bulge approximation with a true curved parametric
  surface per face for a printable Quin-accurate shell.
- Per-face swirl/k overrides (currently global) for asymmetric compositions.
