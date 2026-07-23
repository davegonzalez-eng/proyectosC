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
slider (0–90°, default 3°).

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

### 4c. Arm reach and tip curl

Two more knobs aimed specifically at making the arm-to-ribbon transition
read as one continuous curve instead of a rod meeting a star:

- **Arm reach** is just `tipScale` (§3) exposed directly (default **0.8**;
  push it past 1.0 to reach beyond the pentagon's own edge, toward where a
  ribbon needs to go, leaving it less ground to cover).
- **Tip curl** adds extra swirl rotation on top of the base swirl,
  concentrated near the tip: `swirlTheta += curl · (r2/R_out)^1.6`. Default
  **50°** (with base swirl at 10°) — an aggressive but *graded* sweep,
  barely rotating near the star's center and accelerating toward the arm
  ends, per the reference Quin's pinwheeling arms. Combined with arm reach
  and the earlier-onset tip dip below, the arm spends its last stretch
  already spiraling and sinking toward the ribbon's own trajectory, so the
  ribbon only has to finish a curve already in progress rather than
  execute a sharp U-turn from a standing start.

### 4d. Surface twist (rolling the shells)

The **Surface twist** slider (default **30°**) twists the star's *surface*
the way the ribbons twist along their length: counter-clockwise, in the
planes perpendicular to the direction each arm runs, small near the star's
center and growing toward the rim as `(r/R_out)^1.6`. Implementation
(`applySurfaceTwist()` in `src/geometry.js`): each point's dome (normal)
component is rotated about that point's own in-plane radial direction —
the in-plane part lies exactly on the rotation axis, so only the dome
leans sideways toward the CCW tangential direction, rolling the shell like
a blade. Because the formula depends only on the point's final `(u, w)`
coordinates and bulge height, the tube outline and the cellular fill
compute the *identical* twist (the function is shared), keeping them flush
at their boundary — verified numerically at 30°: max fill/tube boundary
deviation 0.000000000, in-plane radius preserved exactly, and the
tangential lean confirmed CCW. This is what the older per-arm "Arm-axis
twist" (§4b) could never do — its per-arm rotation axes aren't derivable
from `(u, w)` alone, so it would detach the fill (which is why it defaults
to 0).

### 5. Waving (radial distortion)

After swirling, the radius itself is rippled:

```
r' = r2 + (r2 / k) · sin(k · r2)
```

where `r2` is the point's *original*, undistorted distance to the star's
center in the face plane (per the spec — swirl and wave are both independent
functions of `r2`, not of each other's output). `k` controls both the ripple
frequency and (inversely) its amplitude; default `k = 2.7`. Exposed as the
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
faces still meet cleanly at shared edges). Default `bulgeStrength = 0.2`.
A true printable/cast curved-surface export is out of scope for this pass.

### 6b. Tip dip (fusing the arm into its ribbon)

A second, independent inward pull — toward the *sphere's* center this time,
not just the face normal:

```
dip = tipDipStrength · (rFinal / R_out)^1.6
world -= normalize(world) · dip
```

`rFinal` is the radius *after* the wave ripple (§5), not the original `r2` -
see the note at the end of this section for why that distinction matters.
The `1.6` exponent (down from an initial `3`, per feedback that the dip was
starting too late and forcing too sharp a turn right at the very end) makes
the pull ramp in gradually well before the tip rather than only in the last
moment, so the arm curls into the sculpture's body over a visible stretch.
Since this lives inside `distortPoint()`, the tip's tangent (used by the
ribbon, see below) is computed *after* this dip (and after arm reach and
curl above) are applied, so the ribbon automatically continues whatever
curve the arm is already tracing — the two read as one continuous surface
rather than a rod stabbed into a star. Exposed as the **Tip dip** slider
(0–0.6, default 0.36).

**Why `rFinal` and not the original `r2`:** bulge (§6) and tip dip are both
now functions of `rFinal = sqrt(u² + w²)`, which is exactly reconstructible
from a bare `(u, w)` pair alone with no other context. That single choice
is what makes the hex-grid fill (§10) - which generates brand-new interior
points directly in `(u, w)` space, with no original `r2` to refer back to -
land in *exactly* the same place `distortPoint()` would, instead of visibly
drifting away from the tube near the edges (verified: 0.0 distance between
the two for every point on a star's own outline).

### 7. Ribbon connectors

Given two arm labels, `src/ribbon.js:buildRibbon()` threads their tip
positions onto a 5-point Catmull-Rom spline: `tip → leave point → dip point →
leave point → tip`. Catmull-Rom passes exactly through every one of those
points (unlike Bézier control points, which only pull the curve without
touching it), which buys two precise guarantees:

- **Continues the arm's own trend, not a reset direction.** Each "leave"
  point sits a short distance along that tip's *actual tangent*
  (`buildStar()` samples the arm's own curve a hair before the tip via
  finite difference, so it captures however swirl/curl/wave/bulge/arm-twist/
  tip-dip are already bending it) rather than the tip's purely-radial
  `outDir`. Combined with the longer arm reach and tip curl/dip above, the
  ribbon picks up a curve that's already underway instead of first shooting
  outward along `outDir` and only then diving inward. (Verified numerically:
  tangent misalignment at the join is under 0.4° across all 60 connections,
  versus a visible kink before this change.)
- **Exact dip depth.** The middle "dip" point is placed at a precise target
  radius from the sculpture's center: `depthFraction × avgRadius`, where
  `avgRadius` is the average of the two tips' own distance from center.
  Default `depthFraction = 0.93` — the ribbon's lowest point sits at 93% of
  the face's radius, staying just under the surface. (Verified numerically:
  min/max depth ratio across all 60 connections exactly matches the
  configured fraction.) Tunable via the **Ribbon depth** slider (50–100%).
- **Sinkable junctions.** Ribbon depth only moves the mid-dip; the junction
  anchors — arm tips, tube cut edges, ribbon endpoints — stay at the star
  surface by default. Gated by the **Enable joint sink** checkbox (off by
  default — unchecking undoes the effect entirely, rechecking redoes it at
  the remembered slider amount). When enabled, the **Joint sink** slider
  (0–0.4, default 0.15) pulls
  that whole junction set radially inward toward the sphere's center: the
  tube sinks its rings near each cut edge (full strength at the edge,
  fading to zero a short parameter distance into the segment), the
  returned cut points carry the same full-strength sink, and the ribbon
  sinks its tip endpoints identically — so all three stay coincident and
  the fusion remains watertight at any slider value. Crucially, the
  interior fills sink too: the cellular grid sinks any point within a
  tip-proximity falloff matched to the tube's own profile (converted from
  the tube's arc-length parameters to world distances via its measured
  perimeter), and the membrane sinks its tip vertices — without this the
  fill sheet stayed at the surface and simply hid the sunk tubes/ribbons
  beneath it, making the slider look like a no-op in the default
  fill-enabled view. (Verified numerically at sink = 0.2–0.25: cut radii
  reduced by exactly the slider value, ribbon endpoints coincide with the
  sunk cut edges to 0.0 deviation, ~47% of fill vertices move with max
  displacement equal to the slider value, and sink = 0 is bit-identical
  to the unsunk build.)

The cross-section also blends smoothly: its half-width starts at
`tubeRadius` (matching the tube's flattened cut edge, below) at each end and
widens to the full ribbon width only in the middle, so there's no jump in
apparent size at the join. The strip is a twisted *slab* with real physical
thickness, not a zero-thickness film: a top face, bottom face, and two side
walls (each its own vertex strip, keeping the 90° edges crisp), built along
the curve using Frenet frames plus a continuously increasing twist angle
(**Ribbon twist** slider, in full turns; default **0.5**). Thickness is set
by the **Ribbon thick** slider (default **0.012** world units, equal to the
fill's default so both read as the same sheet stock) and tapers at both
ends down to the tube's own flattened cut-edge thickness (2 × 12% of
`tubeRadius`), so the slab butts against the tube cut with matching width
*and* matching thickness.

### 7b. Fusing the tube into the ribbon (the arm's end IS the ribbon)

Matching tangent and width at a shared tip point still left two separate
objects meeting there — a finished tube end with a ribbon laid against it.
The current design removes the seam by removing the overlap entirely:

- **The tube stops short of every tip.** `src/startube.js:buildStarTube()`
  cuts the outline tube in a parameter window (default ±0.04 of the
  perimeter) around each of the 5 tip points, leaving 5 open segments per
  star (the inner-point stretches). Each segment's cross-section is
  circular through its middle and tapers to a flat, `tubeRadius`-wide
  sliver exactly at its cut ends — never fully collapsing (minor axis
  floors at 12% of `tubeRadius`) so normals stay clean. The flat side is
  oriented along `cross(pathTangent, sphereRadial)`: the surface-tangent
  direction, i.e. the sliver lies flat against the sculpture's shell.
- **The ribbons take over the removed stretch.** `buildStarTube()` returns
  the two cut-edge center points per tip (`asc`, approached from the
  previous inner point, and `desc`, toward the next). Every arm is touched
  by exactly two ribbons — once as the source (`a`) of its own face's rule
  and once as the landing (`b`) of a neighbor's — so the source ribbon's
  spline is threaded through the `asc` cut point and the landing ribbon's
  through `desc`. Each ribbon then passes through the tip itself before
  heading off to the other face: together, the two ribbons reconstruct the
  entire removed tip stretch as ribbon surface. The arm doesn't end and
  hand off to a ribbon; it *becomes* two ribbons.
- **Flat sides agree at the joins.** The ribbon solves for a twist-angle
  correction so its flat (width) direction lands on the same
  `cross(tangent, radial)` surface-tangent direction at both of its ends —
  the exact orientation the tube's cut edges are flattened in — with the
  user's twist plus that correction interpolated along the length.

Verified numerically across all 60 connections: the ribbon spline's start
and end coincide with the tube's cut-edge centers to 0.0 deviation, and the
ribbon's end half-width equals `tubeRadius` exactly.

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
typing, **click any two arm markers in the 3D view** — the markers
themselves are invisible by default (a visible dot at every tip read as a
small stub breaking the fused arm/ribbon look), but the geometry is still
there for raycasting: the first click lights its marker up red as feedback,
and the second click appends `A:B` to the text box, redraws, and clears the
highlight.

### 9. Adjacent-face connections (always on)

`src/geometry.js:computeAdjacentFaceConnections()` generates the sculpture's
"neighbor" ribbons from a single combinatorial rule, reverse-engineered from
two reference sets: 5 connections onto face 7, then 5 more onto face 1 to
pin down how it generalizes:

```
F6-A0:F7-A2, F10-A1:F7-A3, F7-A4:F0-A3, F7-A0:F1-A3, F8-A0:F7-A1
F1-A0:F9-A2, F1-A1:F8-A1, F1-A2:F7-A1, F1-A3:F0-A2, F1-A4:F5-A2
```

**The rule.** For face `F` and arm `m`, take the edge of `F` between its
vertices `(m+1)` and `(m+2)` (mod 5). That edge is shared with exactly one
neighbor face `G`. `F`'s arm `m` connects to `G`'s arm at that shared
`(m+2)` vertex (`ruleForArm()`).

**Applied identically to every face.** All 5 of the given face-7 pairs are
exactly face 7's own 5 rule outputs, and all 5 of the given face-1 pairs are
exactly face 1's own 5 rule outputs (verified) — i.e. every face gets to
keep its own 5 edges, with no exceptions or priority between faces. Running
that same, single, unmodified rule across all 12 faces × 5 arms produces
**60 edges total**. An earlier version of this tool tried to reduce that to
one edge per arm (a strict matching), but that reduction is what produced
mismatches against the face-1 reference (e.g. it dropped `F1-A2:F7-A1` in
favor of `F7-A1:F8-A0`, since both can't hold if each arm is limited to one
connection) — the two reference sets are only *simultaneously* satisfiable
by keeping every face's full 5-edge output, unreduced.

**Result:** since an arm can be both the "m" source of its own face's rule
and the landing target of a neighboring face's rule, every one of the 60
arms ends up touched by **exactly two** ribbons — "every arm connected," as
intended, with identical logic run once per face. This is always on;
there's no toggle for it. Manual connections from the text box are merged
in (de-duplicated) on top of this fixed set.

### 10. Filling the star interior: solid membrane or hex grid

Two mutually-exclusive checkboxes (checking one unchecks the other):

- **Fill star interior (thin surface)** triangulates each star's 10-point
  outline (`THREE.ShapeUtils.triangulateShape` on the same local 2D `(u, w)`
  coordinates used to place the outline, via `src/membrane.js`) into a
  panel; with thickness it becomes two parallel layers offset along the
  face normal (the edge gap between them hides inside the tube, so no side
  wall is needed).
- **Fill star interior (cellular grid)** (`src/hexgrid.js`) tiles a
  pointy-top hexagonal lattice across the same local 2D coordinates, clips
  each edge against the star's (concave) outline using a generic
  segment/polygon clip - not just an inside/outside test, so partial cells
  along the boundary are cut cleanly rather than dropped or left
  overhanging - and extrudes every surviving strut into a thin box (top,
  bottom, two side walls) via the shared `applyTipDip()` (§6b) plus the
  same bulge formula, so it follows the star's *actual* surface with real
  edge thickness. Cell size is tunable via the **Cell size** slider
  (default 0.02, stepping in fine 0.005 increments down to 0.01).

  **Organic irregularity:** the **Irregularity** slider (default 0.35)
  displaces every lattice vertex by a deterministic pseudo-random offset
  hashed from its own pre-jitter position - so the three cells sharing a
  vertex all move it identically and the tiling stays watertight - and
  varies each strut's width (0.6-1.4x, hashed from its midpoint). Jittering
  a hex lattice's vertices is the classic cheap stand-in for a Voronoi
  diagram: cells vary in size and shape, and the fill reads as porous,
  cellular material - coral, bone tissue, sea sponge - rather than a
  mechanical hex mesh. At 0 it's back to perfect hexagons. Determinism
  matters: the same slider values always produce the identical pattern
  (verified bit-for-bit across rebuilds).

Both fills take their slab thickness from the **Fill thick** slider
(default **0.012** world units — deliberately equal to the ribbons'
default, so fills and ribbons read as the same sheet stock). The solid
membrane is trivially exact (it's built entirely from the star's own
already-computed outline points, no new ones). The hex grid needed more
care since it generates brand-new interior points directly in `(u, w)`
space with no original `r2` to place them from - see the `rFinal` note in
§6b for how that's kept exact rather than approximate.

### 11. Materials and the lamp

Two `MeshStandardMaterial` instances - one for the stars/membranes, one for
ribbons - are kept in sync on color/metalness/roughness/envMapIntensity (so
the piece reads as one cast/printed material, not mixed parts) and
switchable from the **Material** dropdown:

- **Matte white (lamp)** — the default: near-white, metalness 0, roughness
  0.95, environment reflections dialed way down (0.25) — reads as matte,
  opaque 3D-printed material
- **Bronze** — warm gold, metalness 0.75, roughness 0.32 (the original look)
- **Titanium** — cool grey, metalness 0.9, roughness 0.45 (brushed, not mirror-like)
- **Metallized (chrome)** — near-white, metalness 1.0, roughness 0.08

A generated `RoomEnvironment` (via `THREE.PMREMGenerator`, no external HDRI
needed) is set as `scene.environment` so the metallic presets show real
reflections; the matte preset mostly ignores it.

**The lamp itself:** a warm (`0xffb46b`) `PointLight` with physical
inverse-square falloff sits at the sphere's center, alongside a small
emissive "bulb" sphere so a glowing source is visible through the voids.
The **Lamp glow** slider (default 25, 0 = off) drives only the light - no
geometry rebuild - and the exterior lights are kept deliberately dim so the
internal glow reads as the main light source, highlighting the folds'
contours from inside and shining through the perforations. The renderer
uses ACES filmic tone mapping so the warm glow rolls off gently instead of
clipping to flat white.

The ribbon material additionally carries a bump/roughness map
(`src/hextexture.js:createHexTexture()`) — a small seamlessly-tiling canvas
(`THREE.RepeatWrapping`) of the *same* jittered cellular pattern the 3D
fill builds as real geometry, drawn with the same hash-based vertex jitter
and per-edge width variation. The tile spans 4 hex columns × 8 rows so the
irregularity has room to vary, and every jitter/width hash uses the
vertex's position wrapped modulo the tile size, so cells crossing the tile
border land identically on both sides - seamless under repetition. Three
things are matched to the real fill, not just the pattern shape:

- **Scale along the length:** `buildRibbon()` writes U coordinates from
  actual arc length (via `curve.getLength()`), one tile per
  `4 × sqrt(3) × R_out × hexCellFraction` world units — 4 columns of the
  fill's true cell pitch.
- **Scale across the width:** the V coordinate is *also* mapped in world
  units at the same scale, measured from the ribbon's actual local
  half-width — not stretched so one tile spans the full width, which is
  what previously made ribbon cells look several times larger than the
  fill's (and squashed them as the width tapered). With world-unit V, the
  cells stay the same physical size everywhere; narrow stretches simply
  show fewer of them.
- **Openness:** the fill's struts have a fixed world width (0.03), so at
  the fine 0.02 default cell size the fill reads as a perforated sheet
  with small openings, not thin outlines. The texture's line thickness is
  computed from that same strut-to-cell proportion (and the texture is
  regenerated whenever the cell-size or irregularity slider moves), so
  both surfaces show the same small-holes look at the same pitch.

### 12. Collapsing the control panel

The chevron button in the panel's corner toggles a `.collapsed` class on
the panel, hiding everything below the title/subtitle. Pure CSS/JS, no
persistence across reloads.

### 13. Option B prototype: 5 wide spiral arms per face

Reference photos of Bathsheba Grossman-style paisley/Voronoi lamps show a
much lower-density structure than the current 60-thin-arm lattice: a
handful of dominant, continuous, wide bands, each curling in a tight
logarithmic spiral toward a small terminal eye-hole. Tuning the existing
5-thin-arm-per-face star's parameters can't reach that - it's a different
topology, not a different parameter setting.

`src/spiralarm.js` (a **new, separate module** - `geometry.js`/`startube.js`
are untouched, kept as the current fallback/reference) prototypes the
replacement motif for a single face in isolation. Two exported builders:

- **`buildSpiralBand(face, params)`**: one arm's centerline is a
  logarithmic spiral `r(theta) = r0 * exp(-k*theta)` in the face's local
  `(u, w)` plane, starting at the rim (`theta = 0`, in the same "vertex 0"
  direction the old arm 0's tip used, offset by `angleOffset` for the other
  arms, so a future version can reuse the existing connection machinery)
  and spiraling inward over `turns` turns down to a target inner radius,
  tapering to a point there (or, with `holeLoopTurns` > 0, continuing at
  that constant radius for more turns first - closing a small loop that
  reads as a terminal eye-hole instead of a plain point).
- **`buildSpiralStar(face, params)`**: places `armCount` (default 5, one
  per pentagon vertex) rotated copies of `buildSpiralBand` and merges them
  into one geometry.

  **First attempt was a single arm sweeping the whole face** (1.4 turns,
  closing into an eye-hole) - it read as one wide coil/blob, not a star.
  Placing 5 of those unmodified (same turn count) came out as a solid
  donut: 306° of turning per arm, at that width, made all 5 arms overlap
  each other almost completely, and their shared closing radius punched
  one uniform circular hole through the middle rather than 5 distinct
  points. The fix was cutting per-arm turning down to ~126° (`turns=0.35`,
  `holeLoopTurns=0` - a tapered point, no forced loop) and narrowing the
  band (`bandHalfWidth` 0.22 -> 0.075 of `R_out`) so adjacent arms overlap
  only partially, leaving visible negative space between them - a
  recognizable 5-armed pinwheel, each arm a wide paisley-style blade.

- **Cross-section** (shared by both builders): built the same way
  `startube.js` orients its flattened cut ends -
  `major = cross(tangent, radial-from-sphere-center)`,
  `minor = cross(tangent, major)` - so each arm lies flat against the
  sphere's surface along its whole length, not just at its endpoints.
  Extruded into a real slab (top/bottom/2 side walls + 2 end caps), reusing
  the station-based extrusion technique from `ribbon.js`.
- **Width taper**: constant through most of an arm's length, tapering up
  from a thinner cross-section at the rim attachment point (`t=0`, for a
  future seam with a neighboring face), and tapering back down
  (`endHalfWidthFrac` of the main width) toward the tip - if a hole loop is
  enabled this taper is what keeps that loop's swept width narrower than
  its own radius, so it reads as an open ring instead of filling in solid.
  The taper's position is computed from actual arc length, not the
  spiral's own `theta` parameter, since arc length per radian shrinks
  sharply toward the tight inner turns.
- Same distortion language as the rest of the sculpture (`applySurfaceTwist`,
  `applyTipDip` from `geometry.js`, unmodified) is applied to every arm's
  centerline points, so this motif would sit on the same surface language
  as the current one if wired in later.

`spiral-prototype.html` / `src/spiral-prototype-main.js` render exactly one
face - the 5-arm star plus a wireframe outline of the pentagon it fills,
and nothing else from the rest of the app - with live sliders for every
shape parameter (including arm count), so the motif can be judged (and the
metrics below re-measured) without touching the main scene.

Checked standalone under Node: zero NaN/Infinity across the merged
geometry's ~9700 vertices; the 5 arms' rim points land at exactly 72°
apart around the face normal (0.9°, 72.9°, 144.9°, -71.1°, -143.1° -
uniform spacing to within float precision); with distortion disabled, a
single arm's raw centerline rim point and tip land at their exact target
radii with zero deviation. Checked in headless Chromium: zero console
errors; straight-on view (camera along the face normal) shows 5 distinct
overlapping-but-separated curling blades with visible gaps between them,
not a solid disc, not a donut, and not 5 thin straight lines; angled view
confirms real slab thickness and the bulge/tip-dip/surface-twist
distortion carrying over correctly onto the new centerline.

This is a single-face prototype only - not yet wired into the 12-face,
60-connection sculpture. That wiring (deciding how this motif's 5
rim-attachment points per face relate to the existing 5-connections-per-face
adjacency rule, then replacing every face's star + fill with this motif)
is the next step, pending a read on whether this shape is the right
direction before that larger effort.

### 13b. Fine-tuning proportions: measured coverage sweep, then a real width taper

`spiral-prototype-main.js` exposes `window.__spiralProto` (`setParams()` to
mutate params/sync the slider UI/rebuild, `getPentagonScreenPoly()` to
project the face's own pentagon corners to screen pixels under the current
camera) so a script can drive the isolated prototype the same way a person
dragging sliders would. Used to sweep arm width (`bandHalfWidth`), curl
(`turns`) and center reach (`rHoleFrac`) and measure an actual **Surface
Coverage Ratio** (band pixels ÷ pentagon pixels in a straight-on shot, via
the projected polygon) instead of eyeballing screenshots - coverage rose
from 29% at the original defaults to 57% at the widest/most-curled variant
tried, while a grid of in-between variants confirmed the 5-arm pinwheel
shape survives (doesn't collapse back into a solid donut) well past that
point.

Picking proportions from that sweep surfaced a second issue: the band's
width was constant through nearly its whole length (only a last-moment
narrowing right before the tip), so even a well-proportioned pinwheel read
as 5 blunt paddles rather than pointed star arms. Fixed by replacing the
old `startHalfWidthFrac`/`endHalfWidthFrac` last-moment taper with a
**continuous** taper across the whole arm: `tipWidthFrac` (the width at the
tip, as a fraction of `bandHalfWidth`) and `widthTaperPower` (shapes the
taper curve - 1 is linear, >1 stays fuller near the rim then narrows more
sharply close to the tip) replace it, narrowing every station's width
`Math.pow(t / spiralFrac, widthTaperPower)` of the way from full width down
to `tipWidthFrac`, normalized against `spiralFrac` (arc length, not
`theta`) so the taper still finishes exactly at the tip regardless of curl
amount. Thickness got the analogous `tipThicknessFrac` treatment (kept
comfortably above 0 so the tapered point doesn't collapse to a
degenerate zero-thickness edge).

Current defaults (chosen against the sweep + taper fix): `turns=0.15`,
`rHoleFrac=0.04`, `bandHalfWidth=0.145`, `tipWidthFrac=0.08`,
`widthTaperPower=1.2`, `thickness=0.055`, `tipThicknessFrac=0.5`,
`bulgeStrength=0.15`, `tipDipStrength=0`, `surfTwistDeg=90` - a tight,
low-turning pinwheel (54° per arm) of arms that taper continuously from a
wide head to a fine point, with a strong 90° surface twist giving each
blade a pronounced 3D curl.

Checked standalone under Node: zero NaN/Infinity; sampling one arm's actual
extruded cross-section width at t = 0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1
gives 0.070, 0.139, 0.166, 0.145, 0.106, 0.061, 0.033, 0.014 - width rises
over the short rim-attachment ramp, peaks once, then **strictly
decreases** the rest of the way to the tip, confirming a real continuous
taper rather than a late-moment one. Checked in headless Chromium: zero
console errors; straight-on view shows 5 arms each clearly tapering from a
wide head to a fine point; angled view confirms the taper holds up with
the slab's real thickness and the surface twist's 3D curl.

## File layout

```
index.html                    page shell, collapsible control panel, import map
spiral-prototype.html         Option B prototype: single face, standalone viewer (§13)
src/geometry.js                dodecahedron construction, per-face star math, adjacency-connection rule
src/ribbon.js                  spline-based ribbon geometry (precise dip depth + tangent-matched joins) between two arm tips
src/startube.js                 star tube cut short of every tip (5 open segments, flat cut edges the ribbons fuse into)
src/membrane.js                 thin triangulated fill surface for a star's interior
src/hexgrid.js                   clipped hexagonal-grid fill surface for a star's interior
src/hextexture.js                procedural tileable hex-pattern canvas texture, applied as a bump map on ribbons
src/spiralarm.js                 Option B prototype: single wide logarithmic-spiral band per face (§13), not yet wired into main.js
src/spiral-prototype-main.js     scene/UI for spiral-prototype.html
src/main.js                     Three.js scene, materials/environment, UI wiring, labels, picking, render loop
vendor/three/                   vendored Three.js build + OrbitControls + CSS2DRenderer + RoomEnvironment (no CDN/network dependency)
```

## Verified

- Geometry math checked standalone under Node (`buildDodecahedron`/`buildStar`):
  12 equal-circumradius pentagon faces, exact 72° corner spacing, 20 vertices
  each shared by exactly 3 faces.
- `computeAdjacentFaceConnections()` checked standalone under Node: produces
  exactly 60 pairs, all 5 face-7 reference pairs present, all 5 face-1
  reference pairs present, every one of the 60 arms touched, and degree
  exactly 2 (min = max = 2) for all of them.
- `buildRibbon()` checked standalone under Node across all 60 connection
  pairs with the new defaults: depth ratio (min radius along the curve ÷
  average endpoint radius) exactly matches the configured `depthFraction` in
  every case, and worst-case tangent misalignment between the curve's
  initial tangent and the tip's own arm-tangent is 0.40°.
- The hex-grid continuity fix checked standalone under Node: replicating
  `buildHexGrid()`'s point-placement formula and comparing it against every
  point on a star's own outline gives a max distance of `0.00000000` -
  exact, not approximate (this is what the `rFinal`-instead-of-`r2` change
  in §6b buys).
- The tube/ribbon fusion checked standalone under Node across all 60
  connections: every arm appears exactly once as a source and once as a
  landing (so both cut ends of every tip are claimed by exactly one
  ribbon), the ribbon spline's first and last points coincide with the
  tube's cut-edge centers to 0.00000000 deviation, the ribbon's end
  half-width equals `tubeRadius` exactly, and neither tube nor ribbon
  geometry contains a single NaN.
- Star outline triangulation (`buildMembrane`) and hex-grid clipping
  (`buildHexGrid`) checked standalone: expected triangle counts, no NaNs.
- Slab thickness checked standalone under Node: the ribbon measures exactly
  `0.0072` thick at its ends (= 2 × 12% of the 0.03 tube radius, the tube's
  flattened cut-edge thickness) and exactly `0.0120` through its middle
  (the default slider value); extruded hex-grid struts measure exactly
  `0.0120`; the membrane produces the expected 2 × 10 layered vertices.
- Full app checked in headless Chromium: renders with zero console errors
  against every default in this pass; the collapse chevron hides/shows the
  panel; the hex bump texture is visible on ribbon surfaces at close range
  and reads at the same scale as the star's own hex-grid fill; zoomed
  inspection shows the tube narrowing, flattening, and continuing as the
  ribbon with no cap, stub, or seam, and the ribbons showing real slab
  edges that visibly thicken when the Ribbon thick slider is raised.

## Possible next steps

- Export the lattice (stars + ribbons) as a single manifold mesh (STL/OBJ) for
  3D printing or CNC.
- Replace the flat-face + bulge approximation with a true curved parametric
  surface per face for a printable Quin-accurate shell.
- Per-face swirl/k overrides (currently global) for asymmetric compositions.
