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

### 13c. Taper direction was backwards, plus a hub-gap fix

User feedback on §13b's result: the silhouette read right, but the taper
ran the wrong way. "Tip" in the rest of this codebase (`geometry.js`'s
`star.tips`, `applyTipDip`) always means the OUTER point of an arm; §13b's
`buildSpiralBand` had it backwards, treating the spiral's INNER end (near
the face center) as the "tip" and tapering the width down to a point
*there* - the opposite of a real 5-pointed star, which is narrow at each
outward point and solid/overlapping at the body where the points meet
near the center.

Fixed by reversing the taper and renaming to match: `tipWidthFrac` /
`tipThicknessFrac` now apply at `theta=0` (the rim/outer point, matching
`star.tips`), and the taper runs `Math.pow(t / spiralFrac, widthTaperPower)`
from there UP to full `bandHalfWidth`/`thickness` at the **hub** (renamed
from `rHoleFrac` -> `hubRadiusFrac`, since with this direction it's no
longer a "hole" target but the wide body's center point). The old
`startHalfWidthFrac`/`startThicknessFrac` rim-attachment ramp was removed
entirely - no longer needed, since `theta=0` is now already the correct
narrow tip value with nothing to ramp from.

That surfaced a second, smaller issue: even at full taper width, each
arm's wide hub end sits AT `hubRadiusFrac`, not through the exact center -
with 5 arms rotated evenly, their hub ends form a tiny regular pentagon
around the center rather than meeting there, leaving a hairline gap.
Rather than chase that through more taper-curve tuning, `buildHubCap()`
explicitly fills a small disc (radius `capRadiusFrac`, default 1.5x
`hubRadiusFrac` - comfortably inside where the arms' own taper is already
most of the way to full width) at the same thickness/bulge as the arms,
and `buildSpiralStar()` merges it in - guaranteeing a solid, gap-free
center regardless of exactly how the 5 arms' tapers line up.

Checked standalone under Node: zero NaN/Infinity; sampling the same 8
points along one arm now gives 0.014, 0.019, 0.024, 0.045, 0.085, 0.129,
0.157, 0.176 - **strictly increasing** from tip to hub, confirming the
taper direction is correct. Checked in headless Chromium: zero console
errors; straight-on view shows narrow tips at the pentagon's rim widening
continuously into a solid, visibly gap-free hub at the center; angled view
confirms the fix holds up with real slab thickness and the 90° surface
twist's 3D curl.

### 13d. Rotation direction and a wider band-width range

User feedback: with `turns=0.1` (a very gentle 36° base sweep), the arms'
perceived "spin direction" in the render was dominated by the surface
twist's out-of-plane lean (`applySurfaceTwist`, `surfTwistDeg=90`), not by
the underlying spiral parametrization - flipping just the spiral's own
`theta` direction (`angle = angleOffset - theta` instead of `+ theta`) had
almost no visible effect, confirmed by comparing renders side by side.
`applySurfaceTwist` is shared, verified, established code (used by the
current 5-thin-arm star too), so rather than touch its convention, this
motif's own `surfTwistDeg` default flips to `-90` (slider range widened to
`-90..90`) to read as counter-clockwise. `bandHalfWidth`'s slider range
also widened (`0.02..0.25` -> `0.02..0.4`) per request.

## 14. Option B wired into the full 12-face sculpture

With one face's proportions settled, the next step was connecting all 12
faces' spiral stars at adjacent faces' arm tips, reusing
`computeAdjacentFaceConnections()` - the exact same rule (and the exact
same 60 pairs) the current 5-thin-arm sculpture uses - completely
unmodified.

That reuse only works because arm `i`'s tip (`angleOffset = i * 360/5`, at
`theta=0`) lands at **exactly** the same direction from the face center as
the old star's arm `i` tip (`face.vertices3D[i]`) - checked standalone
under Node across all 12 faces with distortion disabled: `0.000` degrees
of deviation, every face. `computeAdjacentFaceConnections()` is purely
topological (which faces share which vertex), so its output transfers
directly onto this motif's own tip positions with no changes to
`geometry.js` at all.

`src/spiral-dodeca-main.js` / `spiral-dodeca-prototype.html` (another new,
standalone page - `index.html`/`main.js` still untouched) build all 12
faces' `buildSpiralStar()` output, collect every arm's tip
(`{position, outDir, tangent, label: "F<face>-A<arm>"}`, `tangent`
computed the same way `geometry.js`'s `buildStar` does - pointing outward,
continuing the arm's own trend past the tip), then for each of the 60
connection pairs looks up both tips and calls `ribbon.js`'s `buildRibbon()`
directly between them.

Unlike the old system, there's no tube to cut short and fuse a ribbon
into - every arm already extends all the way to a real (if narrow) tip
point - so ribbons connect tip-to-tip directly with no `entryA`/`entryB`
cut points, sized from the arm's own tip half-width/thickness
(`bandHalfWidth * tipWidthFrac`, `thickness * tipThicknessFrac`) so the
seam is width- and thickness-continuous.

**First render was an unrecognizable tangle** - a spiky cage flying far
outside the sphere's silhouette. Toggling the star and ribbon groups
independently (`window.__spiralDodeca.setStarsVisible/setRibbonsVisible`,
added for this diagnosis) isolated the cause immediately: the 12 stars
*alone* already looked like a coherent, evenly-covered 12-pointed star
ball - the chaos was 100% the ribbons. Root cause: this motif's arms barely
curl (`turns=0.1`, a 36° sweep), so a tip's own tangent - measured at
~97% aligned with pure outward-radial - points almost straight out from
the sphere, unlike the old thin-arm star's swirled tips, whose tangent
already leaned tangentially along the surface. `buildRibbon()`'s "leave"
step (travelling `leaveFraction` of the tip-to-tip span along that
tangent before curving toward the neighbor) was launching every ribbon
far outside the shell before it could curve back in. Fixing it needed no
change to `ribbon.js` itself - just passing a much shorter
`leaveFraction` (0.06 vs the default 0.22) through from the connection
loop, keeping the ribbons close to the surface the whole way.

Checked standalone under Node: zero NaN/Infinity across ~117k star
vertices and ~31k ribbon vertices; all 60 of 60 tip labels resolve (no
missing lookups) using `computeAdjacentFaceConnections()`'s pairs
unmodified. Checked in headless Chromium: zero console errors; with the
short `leaveFraction`, the render reads as a single coherent faceted
sculpture - 12 recognizable stars linked by ribbons that hug the sphere's
surface - not a tangle.

This is still a prototype (standalone page, current defaults chosen for
a reasonably calm render rather than fully matching the reference photos'
density/coverage) - next steps would be re-running the coverage/turning-
angle metrics from §13 at the whole-sculpture scale, re-adding the
terminal eye-hole, and only then considering folding this into
`main.js`/`index.html` in place of the current 5-thin-arm system.

### 14b. Connections land in the neighbor's "armpit," not on its arm tip

User feedback with a reference photo: a connection landing directly ON
the neighboring face's arm tip reads as the ribbon just butting into that
arm. In the reference, the connecting swirl instead threads through the
*gap* between two of the neighbor's arms (the "armpit") and disappears
underneath the neighbor's wider body - the destination *arm* (picked by
`computeAdjacentFaceConnections()`'s "skip one arm" rule) was already
correct, only the exact landing *point* near it was wrong.

Added `armpitPoint(face, armIndex, neighborOffset, radiusFrac)` to
`spiral-dodeca-main.js`: a point at the angular midpoint between
`armIndex` and its neighbor (`armIndex + neighborOffset`, `radiusFrac *
R_out` out from center) - built with the exact same
`applySurfaceTwist`/`applyTipDip` pipeline the arms themselves use, so it
sits on the same surface language, just at an angle no arm actually
sweeps through. The connection loop now builds each ribbon's landing
endpoint from this armpit point instead of the destination arm's real
tip (the *source* side, `tipA`, is untouched - still a real tip; only
the landing side changes). `ribbon.js` itself needed no changes: the
existing inward mid-dip (`depthFraction`) does the "passes underneath"
work on its own once the endpoint itself isn't sitting on a visible arm.

Checked standalone under Node: zero NaN/Infinity across all 60 ribbons
built against armpit landing points, all 60 tip/armpit lookups resolve.
Checked in headless Chromium: zero console errors; the render reads
noticeably more organic than the tip-to-tip version - ribbons visibly
thread through gaps between arms rather than terminating flush against
another arm's point, with plenty of individual arm tips now left
exposed as small free spikes (each arm has exactly one real ribbon
touching its own tip - the one where it's the *source* - since incoming
connections now land in a neighboring gap instead).

### 14c. Blending in the earlier hex-web study: rotated stars weave under each other

The user's earlier raymarched study ("Quin Swirling Hex-Web") achieved
the interlocking look a different way: a global **star rotation offset**
(23° about each face normal) plus arms whose tips reach nearly to the
sphere radius. With every star rotated identically, an arm no longer
points at its pentagon vertex - it points at a GAP between two arms of
the equally-rotated neighboring star, and with enough reach it passes
across the face edge into that gap. That - not connector pieces - is
what makes the stars read as woven together.

Blended into the mesh-based prototype, keeping this project's tapered
spiral-curl arms and wider gaps:

- `buildSpiralStar()` gains `starRotationDeg` (default 0; the dodeca page
  sets 23): the whole star rotates about its face normal, every arm's
  starting angle shifted together.
- The dodeca page now exposes `tipScale` ("Tip reach", default 1.05):
  tips physically extend past their own face's edge into the neighbor's
  territory.
- `tipDipStrength` default raised to 0.3: the tip dip is exactly the
  mechanism that pulls those overreaching ends back toward the sphere
  center, so they duck UNDER the neighboring star's surface instead of
  hovering above it. (Verified numerically: with reach 1.05 and dip 0.3,
  a tip sits at radius 1.87 vs 2.04 undipped.)
- `armpitPoint()` tracks the same rotation, so optional ribbon landings
  stay in the (rotated) gaps.
- **Connector ribbons now default OFF** (new checkbox): with rotation +
  reach + dip, the arms THEMSELVES weave under their neighbors, and the
  ribbons on top read as clutter. The whole 60-ribbon system stays one
  checkbox away for comparison.

Checked standalone under Node: arm 0's tip lands at exactly 23.00° with
rotation 23 and exactly 1.05 x R_out with reach 1.05; zero NaN/Infinity
across all 12 faces. Checked in headless Chromium: zero console errors;
the render now reads as 12 rotated pinwheel stars whose curled arms
visibly slide through the gaps of their neighbors and disappear
underneath - the earlier study's interlock, carried by this project's
sea-star arms.

## 15. Solid fused stars, materials, perforation patterns, twisting arm extensions

Four requests in one pass, all on the dodeca prototype page:

**Solid stars.** Each star is now ONE smoothly-fused sheet instead of 5
overlapping slabs. The 5 arms + hub are expressed as a single signed-
distance field in the face's 2D `(u, w)` plane (per-arm distance-to-
centerline minus the local taper half-width, smooth-min'd between arms so
junctions fillet organically - "Arm fusion fillet" slider), marching
squares extracts the outline at iso 0, the region is triangulated
(earcut via `THREE.ShapeUtils`, holes supported) and midpoint-subdivided
so the interior follows the bulge/twist curvature, then mapped through
the same `place()` pipeline as before. The 2D work depends only on
params + R_out - identical for all 12 faces - so it runs once per rebuild
(`buildSolidStar2D`) and is mapped per face (`mapSolidStarToFace`).
Two bugs found by numeric verification along the way: marching-squares
cases 13/14 emitted crossings on edges with no sign change (garbage
points that chained into fragments), and a greedy per-point collinearity
decimation quietly collapsed smooth contours from ~600 points to ~9 -
both fixed (the decimation replaced by simple duplicate-collapse).

**Materials + patterns.** A shared `MeshStandardMaterial` (so stars and
extensions read as one continuous surface) with presets - golden (the
hex-web study's default), matte white (paper/lamp), bronze, copper,
titanium, chrome, gunmetal - and a perforation pattern punched via
`createPerforationTexture` in hextexture.js used as alphaMap (alphaTest
0.45) + bumpMap: solid white with a black hole per hex cell, `holeFrac`
matching the study's HEX HOLE SIZE scale (default 0.24), and a `jitter`
mode where cells deform into irregular organic polygons with varying
hole sizes - the **coral** pattern. UVs on the solid sheet are raw
`(u, w)` world coordinates, so the pattern keeps constant physical scale
across the whole star; "Pattern scale" sets tiles per world unit
(default 1.9 ~ the study's HEX GRID SCALE 15 over a radius-2 sphere).

**Arm extensions instead of ribbons.** `buildArmExtension()`: a Hermite
curve from arm A's tip (leaving along A's own outward tangent) to arm
B's tip (arriving against B's outward tangent, length factor = the
study's EXT LENGTH 0.62), extruded with the arms' own tip cross-section
and rolled gradually about its own axis by "Extension twist" (CCW
positive, default 180° so it lands flat-to-flat at the far end), pulled
inward mid-span ("Extension depth fraction") so it passes under whatever
it crosses. The ribbon system is gone from this page.

**Labels + connection audit.** A "Show F#/A# labels" toggle (CSS2D)
displays each face's F# at its center and every arm's A# at its tip, and
the panel lists all 60 connection pairs - so the mapping (still
`computeAdjacentFaceConnections()`'s rule, reverse-engineered from the
user's original reference sequences for face 7 and face 1) can be
audited and amended pair by pair.

Checked standalone under Node: 2D star ~5.9k verts / 9.5k tris with zero
NaN; 12 mapped faces ~256k verts zero NaN; 60/60 extensions built zero
NaN; timings ~235ms (2D, once) + ~375ms (12 faces) + ~26ms (extensions).
Checked in headless Chromium: zero console errors; golden + hex reads
strikingly close to the reference lamp (perforated metallic bands
weaving); matte white + coral reads as porous coral/bone; labels default
off and toggle correctly (the vendored CSS2DRenderer ignores ancestor
visibility, so the toggle sets each label's own).

## 16. Smoothing the arm/extension seam, denser mesh, a rim bead

Three more fixes on the same page, plus adopting the user's own tuned
parameters as the new defaults.

**Eased twist at the connection.** `buildArmExtension`'s cross-section
twist was linear in `t` (`phi = twistDeg * t`), so its twist *rate* jumped
from zero (the flat, untwisted star sheet it leaves) to full rate right
at the seam - a visible kink. Changed to `phi = twistDeg *
smoothstep(t)` (`t*t*(3-2t)`): the rate is now zero at both `t=0` and
`t=1`, matching the flat sheet on both ends of the connection. (The
arms themselves have no separate twistable cross-section to pre-twist -
in this solid-sheet construction an arm is just part of one continuous
2D field, not an extruded path like the old per-arm slabs - so the fix
had to live entirely in the extension's own profile; that turned out to
be sufficient.)

**Smoother star surface.** The "bolted-plate" look was a real
resolution problem, not a shading bug: `computeVertexNormals()` already
gives correct Gouraud shading, but `earcut` triangulates a polygon using
*only* its boundary points (no interior Steiner points), so the fan of
triangles crossing open interior areas is large and flat between
subdivision rounds - the mesh genuinely doesn't bend there, no matter how
smooth the shading. Raised `subdivisions`' default from 2 to 3 (each
round quarters every triangle) and exposed it as a "Mesh detail" slider.
Cost is real (2D triangulation ~340ms once, but mapping 12 faces + 12
rims now ~4.2s combined) - acceptable for a rebuild-on-change prototype,
not for per-frame slider dragging, so this is a deliberate trade-off
rather than something to chase further without a smarter interior
tessellation (e.g. seeding earcut with interior grid points).

**Rim bead.** `buildStarRim()`: a raised bead traces every boundary loop
of the solid star - the outer silhouette *and* every internal gap edge -
cross-section height `0 -> rimProudFrac*R -> 0` across `rimWidthFrac*R`
inward (`sin(pi*s)` profile, a rounded bead rather than a hard step) so
it sits flush with the sheet at both its true edge and where it rejoins
the interior, with a visible raised lip in between - the same idea as
the earlier Quin study's `RIM_W`/`RIM_PROUD`. The inward 2D direction at
each boundary point comes from the triangulation itself (the third
vertex of whichever triangle owns that edge tells us which side has
material), not a naive centroid guess, so it's correct regardless of
local convexity/concavity.

Defaults updated to the user's own tuned values: `starRotationDeg=24`,
`tipScale=1.28`, `bandHalfWidth=0.24`, `tipWidthFrac=0.44`,
`widthTaperPower=0.8`, `tipThicknessFrac=0.17`, `bulgeStrength=0.23`,
`tipDipStrength=0.32`, `surfTwistDeg=-45`, `extTwistDeg=-210`,
`extLengthFactor=0.38`, `extDepthFraction=0.85`, `holeSize=0.21`,
`patternScale=3.2`.

Checked standalone under Node: zero NaN/Infinity across ~827k star
vertices, ~1.02M rim vertices, 60/60 extensions (all at the new
defaults, subdivisions=3). Checked in headless Chromium: zero console
errors (aside from expected software-rendering GPU-stall warnings from
the headless environment, not app errors); the arm-to-extension seam
reads as one continuous surface rather than a kink; the star's dome
faces read smooth rather than faceted; the rim gives every edge -
outline and internal gaps alike - a defined, crafted border.

## 17. Rim visibility bug, exponential tip-bend, lamp mode, expanded materials

Four fixes requested from a screenshot of the tuned panel plus a lit-lamp
reference photo.

**Rim was invisible no matter what.** `buildStarRim()`'s geometry never got
a `uv` `BufferAttribute` at all. It shares `sculptureMaterial`, which carries
`alphaMap` + `alphaTest=0.45` for the perforation pattern; with no UV data
every fragment samples the alpha texture at (0,0), which the hex/coral
texture renders as a hole (alpha below the test threshold) - so the *entire*
rim was being alpha-discarded regardless of the "Show rim" checkbox or any
slider, exactly matching the report. Fixed by tracking `(u,w)` per rim
vertex with the same raw world-unit convention `mapSolidStarToFace` already
uses, and setting a real `uv` attribute on the rim geometry.

Once visible, the rim read as a "broken chain of tiles" rather than a solid
lip - the hex/coral holes were sized for the wide star arms and were
punching clean through the much narrower rim strip. Fixed by giving the rim
its own `rimMaterial` (same color/metalness/roughness, kept in sync by
`applyMaterialPreset`) with **no** alphaMap/alphaTest - the rim is always
solid, never perforated.

**Exponential tip-bend.** The arm/extension seam still met at a steep angle
even after §16's eased twist, because nothing pushed the *star sheet itself*
to lean toward the incoming extension before the seam - the eased twist only
smoothed the extension's own profile. Added `tipBendRotate`/`tipBendDip` in
`spiralarm.js`: both take `r` (distance from hub) and `R*tipScale` (tip
radius) and raise `t = r/R` to a configurable power (`tipBendPower`, default
5) so the effect is ~0 across most of the arm and switches on sharply only
in the last stretch before the tip - an extra inward dip
(`tipBendStrength`) and an extra CCW rotation (`tipBendTwistDeg`) layered on
top of the existing `applyTipDip`/`applySurfaceTwist`. Wired into both
`mapSolidStarToFace`'s and `buildStarRim`'s `place()` so the rim stays flush
with the bent sheet. Checked standalone under Node with a proxy metric (angle
between an arm's tip tangent and the straight-line direction to its
Hermite-curve extension target): drops from ~80° with no tip-bend to ~43°
at `tipBendStrength=0.12, tipBendTwistDeg=30, tipBendPower=5` - a real
improvement, though the seam is not fully tangent-matched at these settings;
further tuning of the three tip-bend sliders is a reasonable next step if
the visual result still isn't smooth enough.

**Lamp mode.** Added an internal warm `PointLight` at the sphere center plus
an emissive "bulb" core sphere (hidden unless lamp mode is on); toggling it
also dims the external key light and ambient light and darkens the scene
background, so the alpha-tested perforation holes read as light escaping
the shell - the reference photo's effect. `lampIntensity` is live-editable
while lamp mode is on.

**Expanded material palette.** Added `silver`, `brass`, `steel`, `aluminum`,
and `matteClay` presets alongside the existing ones, matching the full
palette from the earlier `quin_swirling_hex_web.html` shader study (now 12
presets total: golden, silver, copper, bronze, brass, steel, chrome,
aluminum, titanium, gunmetal, matteWhite, matteClay).

**`setParams()` debug-hook bug.** Found while testing lamp mode via
`window.__spiralDodeca.setParams({lampMode: true, ...})`: the hook never
called `applyLampMode` and had no branch for checkbox inputs at all (only
`range` and `select`), so lamp-mode tests silently no-opped. Fixed by adding
a checkbox branch and calling `applyLampMode(params.lampMode)` /
`setLabelsVisible(params.showLabels)` at the end of `setParams`.

Checked in headless Chromium: default bronze render shows a continuous,
solid rim along every outline and internal gap; switching to
`{lampMode: true, material: 'matteWhite'}` shows the shell in matte white
with a visibly darkened background and warm light shining through the
perforation holes, matching the reference photo's intent.

## 18. Calligraphic hairpin extensions, cross-section plane, face debug picking, settings export

A reference sheet of cursive practice strokes (down-stroke, tight loop,
up-stroke) prompted a rework of the connector shape itself, plus three
workflow tools requested alongside it.

**Calligraphic hairpin extensions.** `buildArmExtension` previously bridged
tip A to tip B with one smooth Hermite curve. Rewritten as two tangent-
matched analytic pieces: a circular-arc LOOP that departs tip A along its
own outward tangent (continuing the arm's own direction, the "down-stroke"),
sweeps `loopSweepDeg` (default 200 - comfortably under a full turn) around a
center offset sideways by `loopRadius` (sized off the tip's own half-width,
`loopRadiusFactor * halfWidth`, clamped to at most 35% of the straight-line
span so it can't dwarf a short connection), and exits pointing back roughly
the way it came, offset by up to 2x its radius - the hairpin. From there the
same Hermite BRIDGE as before continues to tip B. Both pieces share one
continuous tangent field (the bridge's Hermite tangent at its start is built
from the loop's own exit tangent), so the cross-section frame and the eased
twist ramp stay seamless across the seam, and the mid-span inward dip still
applies over the connector's overall parameter so it still passes under
whatever it crosses. New params: `loopRadiusFactor` (0.5-8, default 3.5),
`loopSweepDeg` (90-300, default 200), `loopTFraction` (0.1-0.5, default 0.3 -
how much of the connector's parameter budget is the loop vs. the bridge).
Checked standalone under Node across all 60 connections: zero NaN/Infinity,
loop radius correctly clamped by span. Checked visually with a throwaway
isolated single-connector viewer (built, screenshotted from three
orientations, then deleted): the shape reads exactly as intended - a
paisley-like loop at the tip continuing into a long sweeping bridge, not a
corkscrew.

**Cross-section "pane".** A single `THREE.Plane` + `PlaneHelper`, sliceable
along X/Y/Z with an offset slider and a flip-side checkbox, applied via
`material.clippingPlanes` on the shared sculpture/rim materials (needs
`renderer.localClippingEnabled = true`). Lets the internal structure and the
lamp core be inspected without the outer shell in the way. Verified with a
before/after screenshot at a large offset: the bottom half of the sphere is
correctly discarded, plane helper visible at the true cut location.

**Click-to-hide faces (debug).** A "Click a face to hide it" checkbox arms a
raycaster against the star sheets; clicking toggles that face's star mesh
and rim mesh invisible, distinguishing an actual click from an orbit-drag
by pointer-travel distance (>4px = drag, ignored). The hidden-face set lives
outside `rebuild()` so it survives every parameter change re-triggering a
full mesh rebuild. Verified with a pixel diff between before/after
screenshots: clicking toggled exactly the region under the cursor, turning
two previously-lit gap openings dark (the hidden face's geometry no longer
occludes the interior).

**Settings-table export.** A "Copy settings table" button serializes every
current `params` entry into a copy-pasteable markdown table, written into a
read-only textarea (auto-selected for a manual copy fallback) and copied to
the clipboard via `navigator.clipboard.writeText`. Verified in headless
Chromium: clicking the button set the textarea's content, showed a "Copied
to clipboard!" status, and a `clipboard.readText()` round-trip matched the
textarea's content exactly.

**Panel/params sync bug, found while verifying the above.** The panel kept
showing stale values (e.g. "Bronze" and an unchecked lamp-mode box) even
though `matteClay` + lamp mode were actually being rendered - confirmed by
sampling rendered pixel colors, which matched `matteClay`/lamp-on exactly.
Root cause: nothing ever pushed the real `params` defaults into their DOM
controls at page load; the HTML's own hardcoded `value`/`checked`/`selected`
attributes are just a static starting point for markup readability and
drift out of sync with the actual JS defaults. Fixed by factoring the sync
logic `setParams` already had into a `syncControl(key)` helper, called once
for every param at startup.

Defaults updated to the user's latest tuned screenshot: `starRotationDeg=27`,
`tipScale=1.4`, `hubRadiusFrac=0.24`, `bandHalfWidth=0.29`,
`tipThicknessFrac=0.22`, `bulgeStrength=0.04`, `tipDipStrength=0.55`,
`tipBendTwistDeg=7`, `tipBendPower=7`, `rimProudFrac=0.015`,
`extTwistDeg=-195`, `material='matteClay'`, `lampMode=true`,
`lampIntensity=19`.

## 19. Horn-triangle connectors replace the hairpin extensions

The hairpin approach (§18) is scrapped. The reference this time was a
"circular horn triangle" - a deltoid-like figure of three concave arcs
meeting at sharp cusps - to be drawn at rim width, in the rim's texture,
with the smoothest possible junction to the arms.

The key discovery making this almost free: the adjacency rule's 60
connection pairs chain into exactly **20 closed 3-cycles, one per
dodecahedron vertex** (verified under Node: 20 cycles, every length 3 -
e.g. `F0-A0 -> F5-A3 -> F11-A2 -> back`). Three faces meet at each
dodecahedron vertex, so three arm tips converge near it, and the
existing rule already groups precisely those three tips. Drawing ONE arc
per pair therefore assembles the 20 horn triangles with no new
bookkeeping at all.

`buildHornArc` (replacing `buildArmExtension`, which is deleted along
with its twist/loop machinery): a Hermite curve whose end tangents are
the arms' own tip tangents - leaving tip A along A's outward direction,
arriving at tip B against B's. This yields the two wanted properties at
once: at every tip the two incident arcs and the arm itself share one
tangent line (the horn triangle's cusp, G1-continuous with the arm - the
worst launch-direction deviation measured across all 60 arcs is 0.47°,
i.e. finite-difference noise), and each arc's launch runs parallel to
the neighboring arm's edge before bending across the gap, since that
edge leaves its own tip in the same direction. `extLengthFactor`
(default 0.55) scales the tangent magnitudes - larger keeps arcs
parallel to the arms longer and bows the triangle sides deeper.

Rendering: an elliptical tube sized off the rim (`arcWidth = 2 *
rimWidthFrac * R * extArcWidthFactor`, `arcHeight = 2 * rimProudFrac *
R`), drawn with `rimMaterial` - the never-perforated rim finish - so the
triangles read as the rim bead continuing off the arm tips across the
gaps. A mild radial squash (`extDepthFraction`, sin-profiled so it is
exactly zero at the cusps) keeps mid-spans from ballooning; the raw
Hermite mid-points already sit at ~0.986 of the endpoint radius, so the
arcs naturally hug the sphere. Panel section reduced to three sliders:
arc bow, arc depth fraction, arc width (x rim width); `showExtensions`
defaults back on since the triangles are the point.

Checked standalone under Node (60 arcs, ~32k vertices): zero
NaN/Infinity, cusp continuity as above. Checked in headless Chromium
with the stars hidden: 20 clean concave-sided triangles with sharp
cusps, matching the reference figure; with stars visible they sit in the
three-face gaps at rim scale.

### 19b. Horn-arc width slider + clothoid (G2) fitting at the tips

Two refinements to the horn triangles.

**Independent bead width.** The arc width was hard-tied to the star
rim's width (`x rim width` multiplier); now it's its own absolute
control, `extArcWidthFrac` ("Arc bead width / R_out", default 0.04 -
matching what the old default computed), so the triangles can be
thickened or thinned without touching the stars' own rim.

**Clothoid fitting.** Matching tangents alone (G1) still allows a
curvature JUMP at the cusp: the arm's centerline arrives at its tip with
real curvature (~1.12 in world units at current settings - tip dip, tip
bend, and the spiral's own curl all contribute), while the old cubic
Hermite launched with whatever curvature its tangent lengths implied. A
true Euler spiral has no closed form between arbitrary 3D endpoint
frames, so this implements what clothoid fitting is *for*: the
centerline is now a QUINTIC Hermite (position + velocity + acceleration
prescribed at both ends), with end accelerations set to
`kappa * |v|^2 * N` from each arm's measured tip-curvature vector -
`mapSolidStarToFace` now estimates it per tip from the circumcircle of
the first three centerline samples in WORLD space, so it includes every
distortion the surface pipeline applies. Curvature at each cusp then
agrees exactly with the arm's (jump 1.12 -> 0 by construction; a
finite-difference probe just off the seam confirms the trend, 0.66 ->
0.43 at t=0.0015 before converging), and ramps continuously,
clothoid-style, into the triangle side's own tight bend - which peaks
mid-cusp at kappa ~68 with or without the fitting; that spike IS the
horn shape, not a defect. `extClothoid` ("Clothoid curvature match",
0-2, default 1) scales the matched curvature: 0 restores the flat
launch, >1 overshoots for a more flourished horn.

Checked standalone under Node: zero NaN across all 60 quintic arcs;
curvature profiles sampled along a representative arc at cf=0 vs cf=1
differ only near the seam (as intended) and are identical through the
cusp's own bend. Checked in headless Chromium: triangles keep their
sharp-cusped deltoid read with the fitting on.

## 20. Renamed to Stardreams; collapsible panel; labels removed; flyover mode

Housekeeping plus one substantial new feature.

**Renamed to Stardreams.** The page title and panel heading no longer say
"Option B prototype" - that was always this project's internal working
codename during development, not a real name. `spiral-dodeca-prototype.html`
and `spiral-dodeca-main.js` are unchanged as filenames (renaming them would
churn every relative import/reference for no user-facing benefit); "the
project" as the user experiences it is the page title and heading, both now
Stardreams.

**Collapsible panel, default collapsed.** Reused the same
`#panel-header`/`#panel-toggle`/`#panel-body` pattern already proven in
`index.html` (the original 60-arm sculpture's page) - a chevron button in
the panel's upper right that rotates -90° and hides `#panel-body` via a
`.collapsed` class toggle. Starts collapsed so the sculpture is what's seen
first, not a wall of sliders.

**F#/A# labels removed.** The whole feature - `CSS2DRenderer`, the
`labelGroup`, `makeLabel`, `setLabelsVisible`, the "Show labels" checkbox -
is gone, not just hidden. It was a development/debugging aid for auditing
the connection rule during earlier rounds; the click-to-hide-a-face debug
toggle serves that auditing purpose better now (and the horn-triangle
adjacency has been numerically verified enough times over past rounds that
the labels were no longer earning their panel space or render cost).

**Flyover mode.** An automated camera tour, built entirely from the same
geometry the render pipeline already produces - not a separate hand-tuned
animation. Two refactors in `spiralarm.js` made this possible with no new
geometry math:

- `mapStarPoint(u, w, R, face, params)` - the tip-bend/twist/bulge/dip
  pipeline previously duplicated inside `mapSolidStarToFace` and
  `buildStarRim`'s local `place()` closures, now a single shared exported
  function both call. `mapArmCenterline(star2D, face, armIndex, params,
  inset)` maps one of `buildSolidStar2D`'s raw per-arm 2D polylines (now
  also returned as `armPolylines2D`) through it, giving the arm's actual
  rendered-surface centerline (tip-first) rather than the flat spiral the
  2D field started from - with an optional inward `inset` (fraction of R)
  so a camera following it reads as flying just inside the shell rather
  than clipping through it.
- `hornArcPointAt(tipA, tipB, options)` - `buildHornArc`'s quintic-Hermite-
  plus-radial-squash centerline function, factored out from the geometry
  builder so it can be sampled on its own.

`buildFlyoverPath()` (`spiral-dodeca-main.js`) uses both, plus the same
`connections` array everything else does, to assemble a closed
`THREE.CatmullRomCurve3`: starting at one arm's tip, each "hop" flies that
arm tip-to-hub ("to the star face"), picks the next arm on the same face
and flies hub-to-tip ("back inside following the next arm"), then follows
one side of that tip's horn triangle to a neighboring star's tip ("turns
right to continue to the tip of the adjacent star") - repeated for 10 hops
across different faces, closing back into a loop. A short establishing
approach (far away -> aligned with the first arm's outward tangent -> just
outside its tip) is prepended so the loop's first beat reads as "approaches,
tilts parallel to a star arm, and zooms in," per the brief.

Each frame, `camera.position`/`camera.up` are set from
`curve.getPointAt(t)` (arc-length parametrized, so speed stays constant
despite the very uneven point spacing between dense arm samples and sparse
arc samples) with `up` banked toward the local outward-radial direction
rather than fixed world-up, so the camera tilts naturally through the
dive-in/out turns instead of rolling awkwardly. `controls.enabled` is
toggled off while active (both OrbitControls and the flyover drive the
same camera) and the camera is reset to its default framing on exit so
control hands back cleanly.

**Arc-length LUT bug, found while verifying the above.** `getPointAt(t)`'s
constant-speed traversal depends on an internal arc-length lookup table
built by sampling `arcLengthDivisions` points UNIFORMLY IN RAW PARAMETER -
the THREE.js default (200) is far coarser than this curve's ~1200+ control
points, which are wildly unevenly spaced (a handful of very long sparse
"approach" jumps next to hundreds of tightly packed arm/arc samples).
With too few divisions, a whole cluster of real control points can land
inside a single LUT interval, whose length then gets measured as the
straight-line CHORD between its two endpoints - badly underestimating true
arc length wherever the path winds a lot within that stretch. That's
exactly what happened: small `t` values were warping straight past the
sparse approach jump into the dense hop section, confirmed by sampling
`getPointAt` at small `t` and finding close-up interior geometry instead of
the intended far establishing shot. Fixed by setting
`curve.arcLengthDivisions = points.length * 4`, comfortably exceeding the
control-point count; re-verified under Node that `getPointAt(t)` for
`t` in `[0, 0.1]` now shows radius-from-origin decreasing smoothly
(7.2 -> 1.9) rather than jumping straight to the near value.

Checked in headless Chromium (using a `performance.now()` monkey-patch in
the TEST harness only, to get deterministic frames despite this software-
rendering environment's unpredictable per-frame cost - no debug hooks were
added to the shipped file): the approach phase is genuinely dark at first
under lamp mode (external lights are dimmed, so a distant view is
authentically underexposed - confirmed by brightness-boosting a "black"
screenshot 8x, which reveals the correctly-framed sphere was there all
along, just dim) and brightens naturally as the camera closes in - reads as
an intentional "emerging from darkness" beat rather than a bug. The tour
flies a continuous, closed loop through several faces with no visible pops
or direction reversals; toggling it off restores the default framing; the
panel starts collapsed and expands correctly via the chevron.

## 21. Flyover speed/rewind control; external-hover flight path

Two follow-up refinements to the flyover.

**Speed control, with rewind.** A "Flyover speed" slider (-2 to 2, default
0.33 - "1/3 of the current speed," per the brief) scales playback rate;
negative values rewind, 0 pauses. This required a real rework of the
camera-update timing, not just a multiplier: the previous version derived
`t` directly from `(now - startTime) / duration`, which only works for a
constant forward rate fixed at activation. Replaced with running state -
`flyoverT` (position in the loop) and `flyoverLastMs` (last update
timestamp) - incremented every frame by `(dt / duration) * speed`, wrapped
correctly into `[0, 1)` even for negative increments (`((t % 1) + 1) % 1`).
This lets speed change - including flipping sign - at any instant with no
discontinuity. The look-ahead sample direction also flips with the sign of
speed (`dir = speed < 0 ? -1 : 1`), so the camera keeps facing the way it's
actually travelling when rewinding rather than staring backwards. Verified
the wrap arithmetic standalone under Node for both a same-sign step and a
step that crosses the 0/1 seam while rewinding.

**External-hover flight path.** The previous path pulled every arm sample
inward (`inset`) to fly "inside the shell." Changed to a small OUTWARD
push instead (`mapArmCenterline(..., -hoverFrac)` - the same inset
parameter, just negative, since it's a signed offset along the local
outward normal) so the camera hugs just outside the arm's external surface
- reading as a low flyover over terrain rather than a trip through the
understructure. A constant gentle downward gaze bias (`FLYOVER_DOWNWARD_TILT_FRAC`,
applied every frame by pulling the look-at target slightly toward the
sphere's center) reinforces that "looking down at the terrain" attitude.

The horn-arc segments are left as the one deliberate exception - their own
`depthFraction` mid-span squash already dips them under the neighboring
star, which *is* "the small space where it goes underneath the adjacent
star." Across just those stretches, two things are baked in, both windowed
smoothly with a `sin(pi*s)` profile (zero at both cusps, peak mid-arc, so
neither pops in or out abruptly): the camera's own position gets nudged a
little to the right (relative to travel direction, via `right =
cross(tangent, outward)`), and a parallel `lookOffsets` array (same length
as the position array, zero everywhere except these stretches) biases the
gaze a little to the *left* - shifting one way while glancing the other,
so passing under the neighbor reads as a deliberate lean-and-look rather
than a straight dive. Looked up at playback time via
`curve.getUtoTmapping(t)` (mapping the arc-length parameter back to the
underlying raw parameter) so the offset lookup stays aligned with the
position sample regardless of the curve's uneven point spacing.

Checked standalone under Node: zero NaN across all ~1200 points and
look-offsets; every sampled point on a representative arm's hover
centerline landed strictly outside (farther from the sphere's center than)
the same arm's un-inset centerline, confirming the external-hover direction;
exactly 230 of 1233 look-offsets are nonzero, matching
`numHops * (arcSamples - 1)` exactly (the two endpoints of each arc window
are zero by construction). Checked in headless Chromium at an accelerated
test speed: the tour now reads as flying low over the visible arm surface
with the horn triangles passing underneath, rather than threading through
the interior.

## 22. Flyover fix: true-normal hover (was ducking under the star) + live tilt control

Follow-up feedback on §21's external-hover path: "the current flyover
trajectory approaches the star, and ends up going under the star right
away."

**Root cause.** The hover offset was applied along the sphere-RADIAL
direction (`p.clone().normalize()`) - a fine approximation over most of a
face, but measured (standalone under Node) to diverge from the star's TRUE
local surface normal by up to ~27 degrees right where the exponential
tip-bend (`tipBendRotate`/`tipBendDip`) curls the surface sharply near a
tip. A small hover pushed "outward" along the wrong (radial) direction at
that steep a mismatch is enough to read as clipping under the shell right
after the approach lands - exactly the reported symptom, and exactly where
it was reported (immediately, at the first tip).

**Fix.** New `mapArmCenterlineWithNormal()` in spiralarm.js returns each
arm sample's TRUE local normal (finite difference in (u, w), the same
technique `mapSolidStarToFace` already uses for its own vertex normals),
not just the sphere-radial direction. `buildFlyoverPath` now hovers along
this true normal, and also threads it through as a third parallel array
(`normals`, alongside `points` and `lookOffsets`) so `updateFlyoverCamera`
can look up an interpolated true normal at any point along the curve (via
the same `getUtoTmapping` + lerp technique `lookOffsets` already used) and
use it for BOTH the hover already baked into position and the camera's own
banking (`camera.up`) - previously the coarser radial approximation.
Horn-arc points, which have no local (u, w) frame of their own, keep the
radial approximation as a reasonable fallback (they're not meant to hug a
specific star's surface anyway - they deliberately dip under).

**Live tilt control.** Arrow Up/Down adjust a running `flyoverTiltOffset`
(step 0.03, clamped to +-0.4) added to the baseline downward-gaze bias,
so the view can go from looking below the sphere's "horizon" (down into
the surface, toward the lamp core) to above it (out past the rim into
open space) at any point during the tour, without stopping playback.
Keys only respond while flyover mode is on.

Checked standalone under Node: zero NaN across all points/normals/
look-offsets in the rebuilt path. Checked in headless Chromium using a
`performance.now()` monkey-patch in the TEST harness (two-phase - anchor
a timestamp, then jump it forward and re-freeze - needed because a
single frozen value never advances `flyoverT`, an artifact of the running-
state timing model, not a bug in it) to capture deterministic frames
across the approach and first two hops: the tour now reads as gliding
just above the external surface with no visible dip under the shell.
A tilt A/B test (freezing playback at a fixed point, then sending 6x
Arrow Down and 12x Arrow Up) confirmed the gaze swings from looking down
through the perforations at the lamp core to looking up past the horizon
into open space, as intended.

## 23. Flyover hover clears the slab's real thickness/rim; own panel; Space to pause

Follow-up on §22's fix, which corrected the hover DIRECTION but not its
DISTANCE: "it is going under (by a tiny bit). I noticed that if I clicked
the up arrow it was 'showing double' and when increasing the thickness it
made me think it is flying above the midpoint of the star inner surface
but below the outer surface."

**Root cause.** `mapStarPoint` (and so `mapArmCenterlineWithNormal`)
returns the star sheet's MIDPLANE - `mapSolidStarToFace` builds the actual
rendered top/bottom sheets by offsetting *that* by `+-thickness/2` along
the normal, and the rim bead sits proud of the top sheet by another
`rimProudFrac` right where the boundary passes near the tip. The flyover's
hover distance was a flat `0.02` (fraction of R), completely independent
of those two params. At the defaults (thickness 0.015, rimProudFrac 0.02)
the true outer surface sits at `0.0075 + 0.02 = 0.0275` above the
midplane - already past the old 0.02 hover, so the camera was hovering to
a point still BELOW the true outer surface: literally sandwiched between
the two sheets. That's exactly what the user diagnosed ("above the
midpoint... but below the outer surface") and exactly what produces
"showing double" - a camera behind the alpha-tested top sheet sees both
its own underside and whatever's visible through its perforation holes,
layered.

**Fix.** `hoverFrac` is now computed from the actual current params -
`thickness/2 + (showRim ? rimProudFrac : 0) + 0.02` margin - instead of a
disconnected constant, so it always clears the real outer surface (and
stays correct if those sliders change later). The horn-arc segments had
the same class of bug one level worse: they had NO hover at all, sitting
exactly on the arc tube's own centerline - i.e. inside the solid tube the
whole time. Fixed the same way, clearing `max(rimProudFrac, 0.005)` (the
tube's own half-height, matching the `arcHeight` used when the tube is
actually built) plus the same margin.

**Separate panel.** The Flyover controls (enable checkbox, speed slider,
keyboard hints) moved out of the main parameters panel into their own
small floating panel (bottom-left) - it's a mode you fly in, not a shape
parameter, and mixing it into two dozen sliders meant it could vanish
whenever that panel collapsed.

**Space to pause/resume.** A `flyoverSpeedBeforePause` variable remembers
whatever speed was actually set - not a hardcoded default - the moment
Space zeroes it, and restores exactly that value on the next press
(falling back to 0.33 only if paused some other way, e.g. dragging the
speed slider to 0 directly). The speed slider's displayed value updates
to match either way.

Checked standalone under Node: with current defaults, the old hover
(0.02) sits *below* the true outer surface (0.0275) - reproducing the
bug analytically - while the new hover (0.0475) clears it with a 0.02
margin; the horn-arc tube fix similarly goes from 0 clearance to 0.02.
Checked in headless Chromium (same two-phase `performance.now`
monkey-patch technique as §22) at a tip-crossing point with the tilt
pushed up (where "showing double" was reported): no double-vision
artifact. Space-to-pause verified directly: pressing it once from a
running 0.33 zeroes `params.flyoverSpeed` and the slider; pressing it
again restores exactly 0.33.

## 24. Baked-in defaults from the user's own tuning; an orbit flourish after each horn-arc crossing; spatially-varying speed

Follow-up on §23: "still crossing the surface and showing underneath. this
might be a valuable hint. if i reduce the thickness to 0.01 and do 4
up_arrows, it works well for most of the current trajectory. so let's have
that as the default for the trajectory." Plus two new asks: an "orbit
flourish" right after each horn-triangle crossing, and speed that varies
with what's happening along the path.

**New defaults.** `thickness` 0.015 -> 0.01 (slider default/label to match).
`FLYOVER_DOWNWARD_TILT_FRAC` goes from `0.1` to `0.1 - 4*0.03 = -0.02` -
exactly what four Arrow-Up presses (`FLYOVER_TILT_STEP = 0.03` each) would
have subtracted from the old baseline, so the zero-offset view now IS the
user's found-good tilt.

**Orbit flourish.** Right after a horn-arc lands on a neighboring star's
tip (end of step (c) in `buildFlyoverPath`), a new step (d) pulls the
camera up and out, sweeps 4/5 of a full turn (288 degrees) around that
face at a wider radius/height while gazing at the face center, then spends
the remaining 1/5 of the turn descending - both position and angle -
back down to the exact hover point/normal the next hop's arm traversal
starts from, so the loop stays seamless. Two false starts on the way to
this:

- First pass sized the zoom-out radius/height directly off `R_out`
  (`*1.6` / `*0.9`). Numerically clean (no NaNs) but visually the camera
  ended up floating outside the *entire* dodecahedron's silhouette -
  confirmed by dropping a debug marker at the computed position and
  screenshotting from the default overview camera, which showed it hanging
  in empty space well past the sculpture's edge. Root cause: faces sit
  close together around a fairly compact sculpture, so lifting a whole
  `R_out` along the face normal is enough clearance to clear the *entire*
  object, not just orbit above one star. Fixed by shrinking to `R_out*1.15`
  radius / `R_out*0.35` height - just past the star's own tips, not past
  the whole sculpture.
- Even after that, first-person screenshots *from* the flourish camera
  were still solid black. The marker was on the object, but the gaze
  wasn't: the orbit reused the same "look at the curve's own next point,
  plus a couple-percent downward-tilt bias" scheme the arm/arc segments
  use, which works for nose-first surface-hugging flight but can't swing
  the gaze ~80 degrees down-and-inward the way looking AT a star from a
  wide orbit needs - measured directly (dot product between camera forward
  and the direction toward face center) at roughly 0.15, i.e. ~81 degrees
  off. Fixed by baking a large explicit `lookOffset` (the pre-existing
  `lookOffsets` parallel array, previously only used for the horn-arc's
  lateral gaze bias) into every orbit-phase point: the vector from the
  default lookahead point to the face center, easing in across the
  zoom-out and back out across the descend so it hands off smoothly to
  the plain forward-hugging look on both ends.

**Spatially-varying speed.** A new `speedMultipliers` parallel array
(alongside `points`/`normals`/`lookOffsets`, sampled the same way via a new
`sampleFlyoverScalar`) scales how fast `flyoverT` advances at each point,
multiplying `params.flyoverSpeed` rather than replacing it (so pause/
rewind still work everywhere): arm segments taper down to 0.55x near the
tip (the thinnest part of the star) and back up to 1x by the hub; horn-arc
segments run at 0.4x through the "maneuvering around the triangle"
midsection, ramping up to 1.5x in the last quarter as the arc emerges from
underneath back onto the next star's main surface; the orbit flourish
carries that 1.5x pace into its zoom-out, easing back to the normal 1x
cruising speed as it settles into the wide orbit.

Checked numerically in Node (loading the actual shipped `buildFlyoverPath`
straight from source via a small `new Function` wrapper, not a hand-typed
copy, so the check can't drift from what's shipped): 2533 points across
all 10 hops, zero NaN/Infinity in 6000 arc-length samples, zero invalid
normals, `speedMultipliers` bounded to [0.4, 1.5]. Checked visually in
headless Chromium two ways - direct `flyoverT` injection at specific
points (approach, arm mid, arc mid, zoom-out, three cruise points, descend,
next-hop handoff) after the orbit fix, all showing well-framed close or
wide star views with no black/empty frames; and a real-timing run (actual
checkbox toggle, several seconds of wall-clock flight, no `performance.now`
patching) with zero console/page errors, confirming the whole thing holds
up under normal playback, not just at hand-picked sample points.

## 25. Three presets: Stardream #1, Stardream - 3D Printing, Star Odyssey

The user asked to branch the project into three selectable presets (a new
dropdown, top-right, standalone like the Flyover panel): the current
sculpture unchanged as "Stardream #1"; a "Stardream - 3D Printing" preset
focused on one detailed, printable face with a snap-together joint
mechanism at the tips; and a "Star Odyssey" preset that reworks the
connector itself - instead of the horn-arc bowing tip-to-tip around the
outside, each of the three meeting tips spirals inward, converging at the
horn-triangle's own center.

Two design decisions were the user's call, not mine, so I asked before
building: the snap mechanism (peg + socket friction fit, over dovetail or a
print-in-place cantilever clip - simplest to get right on a first pass, no
supports needed at the joint) and the 3-way joint topology (a small
separate corner hub piece per vertex, 20 total, rather than the three tips
interlocking directly with each other - the hub does the alignment work,
which is far more forgiving across 20 joints than three-way pairwise
features would be).

**Preset architecture.** `PRESETS` is three complete parameter bundles
(shape, appearance, AND mode flags - each is a full snapshot, not just a
diff off whatever was set before, so switching presets can't leave a
previous preset's material/pattern/lamp-mode stuck in place). Selecting one
calls the existing `setParams()` machinery. New mode params:
`singleFaceMode`/`singleFaceIndex` (render one face only), `connectorStyle`
(`hornArc` / `snapHub` / `spiralVortex`), and `snapEnabled` plus the
snap/spiral shape params.

**`computeThreeCycles`** (geometry.js): the 60 connection pairs chain into
20 closed 3-cycles - one per dodecahedron vertex - but nothing before this
needed to see three tips at once (`buildHornArc` only ever looks at one
pair). Brute-force triangle-finding on the 60-node adjacency graph (for
every label, for every pair of its neighbors, check if THEY'RE connected
too); checked under Node: 20 triples, covering all 60 pairs with none left
over.

**Stardream - 3D Printing.** Renders only `faces[singleFaceIndex]` -
hidden faces skip the expensive top/bottom-sheet + wall build entirely via
a new `computeArmTips` (the tip-position/tangent/curvature computation
factored out of `mapSolidStarToFace`, which still needs to run for every
face since tips near the isolated one are needed for its snap-hub pieces).
Tip width/thickness are pulled way up from the display defaults (0.12/0.17
-> 0.4/0.6) - the printability assessment this follows up on found that
even at a generous 250mm print, the display-default tip wall measured under
0.15mm, well below a single 0.4mm nozzle line; this preset is explicitly
allowed to look chunkier so there's real material to work with.

*Snap-hole sockets*: a REAL geometric through-hole (not the alphaMap-
texture perforation elsewhere in the app) cut into each arm tip, sized for
a peg pushed through the thin sheet. `buildSolidStar2D`'s field is a
signed-distance union of arm distances - standard CSG subtraction
(`max(field, -holeSDF)`) cuts a crisp-edged circular hole wherever wanted,
reusing the existing marching-squares/boundary-loop/wall-building pipeline
unchanged (a hole is just another boundary loop to it). The hole center is
placed by walking the arm's own centerline `snapHoleInsetFrac * R` in from
the tip (arc length, not a fixed sample index) so its full circumference
lands in solid material instead of notching the tip edge.

*Snap-hub piece* (`buildSnapHubGroup`): a small separate part per vertex -
body at `hornTriangleCenter` (the centroid of the three tips, "the center
of the current circular horn triangle"), three pegs reaching toward each
tip's socket, each driven deep into the body so the overlapping solid
primitives print fine without true CSG union (no boolean library is
vendored; this leans on that instead, same as a real print would need
either way). Only the up-to-5 hubs actually touching the isolated face get
built.

**Star Odyssey.** Same star/arm geometry as Stardream #1 - the brief was to
change the connection, not the stars - but `buildSpiralVortexGroup`
replaces every horn-arc pair with a 3-way conical spiral converging at
`hornTriangleCenter`: each tip's own outward tangent (projected
perpendicular to the tip-to-center axis) sets the spiral's initial sweep
direction, so the connector at least leaves the tip continuing the arm's
lean, though exact curvature/tangent matching (like the horn arc's
clothoid fit) isn't attempted - there's no single natural tangent to match
at a point three curves converge on, unlike the paired horn arc. Sweep
radius shrinks LINEARLY to a small nub while the angle keeps advancing at a
constant rate (a conical, not logarithmic, spiral - avoids the log/exp
singularity a true logarithmic spiral has at r -> 0).

**Two real bugs, caught before shipping:**
- First pass sized the print preset's `fieldGrid`/`subdivisions` for
  maximum smoothness (220/4) since only one face gets built now - but
  under this environment's software-rendered headless Chromium, the
  resulting ~660k-vertex single face made every frame slow enough that
  Playwright's screenshot call timed out at 2 minutes. Dropped to
  180/3 (~210k vertices, ~750ms to build) - still comfortably more detail
  than the display default's 144/3 across twelve faces, and interactive
  again.
- Switching presets originally only changed whatever keys each preset's
  bundle happened to mention - going 3D-Printing -> Stardream #1 correctly
  restored the shape/mode but left the PREVIOUS preset's matte-white/no-
  pattern/lamp-off appearance in place, since Stardream #1's bundle never
  mentioned those keys. Caught by an actual round-trip screenshot (not just
  "does it error"), which showed a colorless "Stardream #1." Fixed by
  making every preset bundle set its appearance explicitly.

Checked in headless Chromium: each preset selected via the real dropdown
(not a debug hook) - Stardream #1 unchanged from before this round;
3D-Printing shows one matte-white face with five 3-peg hub pieces visibly
seated near its tips, confirmed live (via the page's own loaded module) to
have five real ~0.06-radius through-holes with distinct centers, not just
a texture; Star Odyssey's connectors alone (stars hidden) read as a
striking 20-vortex wireframe ball, each cluster a clean 3-way spiral
funnel. A 5-hop round-trip through all three presets produced zero
console/page errors and landed back on a fully-correct golden/hex/lamp-on
Stardream #1.

**Known limitations, for a future round:** the flyover camera path still
assumes the original horn-arc connector shape - it's disabled entirely in
single-face mode (nothing to fly around), but in Star Odyssey it still
flies the old horn-arc-shaped path near vertices whose visible connector is
now the spiral vortex, a cosmetic mismatch. No STL/3MF export exists yet
(flagged in the printability assessment this whole branch follows from) -
the 3D-Printing preset is print-READY geometry, not yet an exportable file.

## 26. Follow-up fixes: spiral direction/smoothness, hub/peg alignment, flyover crossing redesign

Three separate fixes from feedback on §25's three presets.

**Star Odyssey spiral: reversed direction, clothoid-smooth tip merge.**
Two problems: the vortex spun the wrong way, and it didn't even leave the
tip cleanly - the OLD parametrization's `t=0` point sat a full sweep-radius
away from the actual tip position, let alone matched the arm's own
departure tangent there. Rebuilt `spiralVortexPointAt` as two curves added
together: (1) a tangent-matched quadratic Bezier from the tip to the
center, control point placed along the arm's own outward tip tangent, so
the base curve alone already leaves the tip exactly continuing the arm's
direction and lands exactly at the center; (2) a swirl on top, using an
envelope (`t^2*(1-t)`) that's both zero-VALUE and zero-SLOPE at `t=0` - so
it contributes nothing to position or tangent right at the tip, leaving
(1)'s clean match untouched - rising to a peak, then easing back to zero at
the center so the three tips still converge there exactly. The swirl's own
angle ramps as `t^2` (zero angular rate at the tip, growing linearly with
`t`) - curvature growing linearly from zero is the defining property of a
clothoid. A new `direction` option (default flipped from the implicit old
behavior) reverses the handedness. Checked analytically and numerically:
the numeric tangent at `t=0` now matches the real arm tangent to 6 decimal
places, `t=0`/`t=1` land exactly on the tip/center, regardless of `turns`
or `sweepFrac`.

**Snap-hub pegs now actually reach the sockets; tip protuberance gone.**
Two related bugs. First, `computeArmTips` now also returns each arm's
`snapHolePosition` (the socket's real WORLD position, computed by mapping
`star2D.snapHoleCenters2D`'s already-known 2D coordinate through the same
`place()` pipeline everything else uses) - `buildSnapHubGroup`'s pegs
previously aimed at the raw tip point via a straight line from the
horn-triangle center, but the socket sits INSET along the arm's own
(bent/twisted) centerline, not on that straight line, so pegs missed
entirely. Pegs are now sized and aimed at the real socket position, with a
15% overshoot (`snapPegOvershoot`) so they fully poke through the thin
printed sheet rather than just touching it. Second, the print preset now
sets `tipBendStrength: 0, tipBendTwistDeg: 0` - the exponential tip-bend
exists purely to pre-angle the DISPLAY tip to match the old horn-arc's
incoming tangent; with a straight peg instead of a curved arc there's
nothing left for it to match, and at this preset's much wider/thicker tip
it read as a "weird head/protuberance." Checked in headless Chromium: pegs
from multiple hub pieces visibly reach into the star's tip edges at
several connection points, and the tips themselves are flat and clean, no
bulge.

**Flyover: default speed 0.03; horn-triangle crossing redesigned.** The
old crossing flew directly along the rendered horn-arc bead, including its
own mid-span dip underneath the neighboring star - reported as
disorienting. Replaced with the same "pull out, orbit, come back down"
shape the star-face flourish already uses, just scaled down: zoom out from
the tip just reached, orbit exactly 120 degrees (the three meeting tips'
own natural spacing) around the horn-triangle's TRUE center - the centroid
of all three tips at that vertex (found via `computeThreeCycles`, not just
the two tips this hop touches), sized off their own average spread rather
than a whole face's `R_out` - then descend back onto the neighboring
star's tip, landing at the exact point the star flourish (and the next
hop's own arm traversal) already use as their reference.

Caught two bugs before shipping, both the same class:
- The `hornTriangleCenter` lookup needs the THIRD tip of the vertex (not
  just the two this hop's pair touches) - found via `threeCycles.find()`
  matching both labels, third label = whichever of the triple isn't either
  of those two.
- Both the new horn-triangle flourish AND the pre-existing star flourish
  eased their "look at the pivot" gaze bias in LINEARLY with the zoom/
  descend progress (`.multiplyScalar(t)` / `.multiplyScalar(1 - t)`).
  Sampling specific points along the curve (a debug hook temporarily
  exposed the raw camera position/direction) turned up several BLACK
  frames - measured directly, right as a zoom-out begins the camera is
  still looking tangent-forward off the tip, up to ~90 degrees from the
  actual pivot, and a bias that's still mostly faded in that early doesn't
  reliably outweigh the default lookahead. Fixed by applying the zoom's
  offset at FULL strength immediately (no `t` easing - snapping to "look at
  the pivot" reads fine at flyover speed) and switching the descend's
  taper from linear to `1 - t^2`, which holds the correction close to full
  strength through most of the descent and only relaxes it in the final
  stretch, right as position/normal are themselves converging on the
  target anyway. The star flourish had the identical bug (same code
  pattern, never actually exercised at the same problem angles before) -
  fixed the same way in both places.

Checked in headless Chromium: swept ~20 points across a full hop (arm end,
both flourishes' zoom/cruise/descend phases, next hop's start) before the
fix, found black frames exactly where the tangent-vs-pivot math predicted;
same sweep after the fix shows real geometry everywhere, including the
"hovering around the full star face" the user specifically likes,
unchanged. A 6-second real-timing run (actual checkbox toggle, no debug
time-injection) at the new 0.03 default produced zero console errors.

## 27. Connector checkbox actually gates every style; hub/peg pieces stop shooting off-screen; gentler spiral defaults

Three more rounds of feedback on §25/§26, all traced back to the same root
cause: the "Show horn arcs" checkbox (renamed "Show connectors") had been
extended to gate all three connector styles' code paths, but the `print3d`
and `starOdyssey` preset bundles themselves still set `showExtensions:
false` - a leftover from BEFORE the styles were unified under one flag, back
when `snapHub`/`spiralVortex` ran unconditionally regardless of the
checkbox. Once the gating was fixed, that leftover `false` meant the hub/peg
pieces and spiral funnels - each preset's entire reason for existing -
never built at all. Both presets now default `showExtensions: true`.

**Why this looked like three unrelated bugs.** With the connectors silently
never built, screenshots of "the hub/peg sizing" were actually only showing
the socket holes (a separate CSG cut into the star's own geometry,
independent of `showExtensions`) - no peg or hub body was ever on screen.
Toggling the checkbox off then on again was a false→false, then a
false→true transition whose "on" screenshot never got captured before an
unrelated verification bug (see below) - so the checkbox looked broken even
after the gating fix actually landed.

**Once actually visible, the hub/peg pieces revealed a real second bug.**
`buildSnapHubGroup` draws all 3 pegs of a corner hub (one toward each of the
vertex's 3 tips) unconditionally. In single-face preview mode - the ONLY
mode `print3d` ever renders in - only 1 of those 3 tips belongs to the
face actually on screen; the other 2 pegs point toward tips on faces that
aren't drawn, so they read as thin sticks shooting off past the visible
star into empty space. That, not the peg's own length (already correctly
under the triangle's side length - `dist * snapPegOvershoot` measured
~0.97 against a ~1.46 side), is what made the assembly look "way too
large/long." Added a `pegMask` option to `buildSnapHubGroup`; the caller
now only requests a peg toward tips whose label prefix matches the visible
face, so each corner hub in single-face view draws exactly one peg,
anchored to the one socket that's actually on screen.

**Star Odyssey spiral: turns and sweep both cut by roughly two-thirds and
half respectively** (`spiralTurns` 0.65→0.22, `spiralSweepFrac` 0.4→0.22),
addressing "the
star's tips... seem to be doing an unnecessary extra turn, so they're too
curly." The clothoid tangent-match from §26 already guarantees a kink-free
departure from the tip; this round's change only reduces how far the swirl
winds before reaching the center, per the request to connect with "a
smoother curve" rather than changing the underlying curve construction.
Also added the missing Odyssey-specific sliders (`spiralTurns`,
`spiralSweepFrac`, `spiralArcWidthFrac`) to the panel, shown/hidden opposite
the horn-arc sliders based on `connectorStyle` - previously Star Odyssey
showed the horn-arc panel's 4 sliders even though `buildSpiralVortexGroup`
reads none of them, which was the other half of "none of those 4 scrolling
bars" doing anything.

Verified in headless Chromium: `showExtensions` reads back `true`
immediately after selecting either preset (previously `false`); the
print3d hub pieces now show exactly one peg per vertex, each terminating
within the star's own footprint instead of running off past the frame
edge; the Odyssey slider panel swaps correctly
(`hornArcControls`/`spiralVortexControls` computed `display` flips between
`none`/`block` on preset switch). The Playwright environment was
intermittently flaky for longer multi-step scripts during this round
(browser closing mid-script on otherwise-unrelated timeouts), which
prevented capturing a direct old-vs-new pixel diff of the spiral's
curliness; the turns/sweep reduction itself was verified by reading back
the live `params` values and confirming the new preset defaults actually
take effect, but its visual smoothness should get a final look from the
user.

## 28. Flyover: fixed a residual black-void frame and a tight/dizzying final turn in the horn-triangle crossing flourish

§26 fixed the horn-triangle crossing's zoom-out (b) → (c) seam by applying
the "look at the pivot" gaze offset at full strength immediately instead of
easing it in. That fixed the reported problem at the time, but left a
different, smaller one: the crossing's LANDING descend - the "last turn"
right after the 120-degree hover, dropping back down onto the neighboring
star's tip - eases that same offset back OUT via `1 - t^2`, timed to hit
zero exactly as position/normal finish converging on the target. The two
don't decay at matched rates: by ~90% through the descend, position has
already landed almost exactly on the tip (the thinnest, narrowest part of
the star), but the offset - sized off the whole flourish's orbit radius,
not off how close the camera now is to that tip - still carries ~8% of its
full magnitude. At the tip's scale, 8% of a whole-orbit-sized vector is
still big enough to swing the look target clean off the sliver of geometry
into the black background behind it.

Found by building (then removing) a debug harness rather than guessing:
`buildFlyoverPath` temporarily logged each phase's starting index into the
control-point array, and a `window.__spiralDodeca` debug hook sampled the
curve at an exact raw parameter, set the REAL camera to that pose, and cast
a small ray grid across its actual FOV to check whether anything was
visible on screen at all (a single center-ray test was tried first and
produced many false positives - during ordinary tangent-hugging arm flight
the gaze ray often grazes past the surface even though the star fills most
of the frame from the side, so "center ray doesn't hit" is not the same as
"screen is black"). That pinpointed one genuine all-black stretch, right
where the phase log put it: the tail of the horn-triangle descend, confirmed
by screenshotting that exact frame.

Fixed with an extra cutoff multiplied on top of the existing `1 - t^2`,
left at 1 (no change to the already-tuned "most of the descent" behavior)
through the first 80% of the descend and only kicking in over the final
20%, forcing the residual offset the rest of the way to ~0 by the time
position has actually arrived instead of leaving it dangling at a
still-significant fraction. Applied to both the horn-triangle crossing's
descend and the whole-star orbit flourish's own descend, since the same
math (and the same risk) is shared by both. The horn-triangle descend's
sample count was also bumped from 16 to 28, denser Catmull-Rom waypoints
through exactly the stretch reported as "quite tight, almost dizzying" -
the same segment the void fix targets, so the reorientation that used to
happen abruptly over a few widely-spaced samples now interpolates over
nearly twice as many.

Verified: re-ran the same debug sweep after the fix and the previously
all-black frame (confirmed via direct screenshot at that exact camera pose)
now shows normal geometry; an 8-second real-timing run at 5x speed (no
debug time-injection, `flyoverSpeed: 0.15`) produced zero console errors.
All debug hooks (`__debugPhaseLog`, `__debugScreenHasGeometryAtRaw`, and
the phase-marking scaffolding in `buildFlyoverPath`) were removed after
verification.

## File layout

```
index.html                     page shell, collapsible control panel, import map
spiral-prototype.html          single-face standalone viewer for the spiral-star motif (§13)
spiral-dodeca-prototype.html   Stardreams: full 12-face sculpture, standalone viewer (§14, renamed §20)
src/geometry.js                 dodecahedron construction, per-face star math, adjacency-connection rule
src/ribbon.js                   spline-based ribbon geometry (precise dip depth + tangent-matched joins) between two arm tips
src/startube.js                  star tube cut short of every tip (5 open segments, flat cut edges the ribbons fuse into)
src/membrane.js                  thin triangulated fill surface for a star's interior
src/hexgrid.js                    clipped hexagonal-grid fill surface for a star's interior
src/hextexture.js                 procedural tileable hex-pattern canvas texture, applied as a bump map on ribbons
src/spiralarm.js                  5-arm spiral-star motif per face (§13), also the shared surface-mapping math (§19) all of Stardreams renders from
src/spiral-prototype-main.js      scene/UI for spiral-prototype.html
src/spiral-dodeca-main.js         scene/UI for spiral-dodeca-prototype.html - all 12 faces + adjacency-rule ribbon connections (§14)
src/main.js                      Three.js scene, materials/environment, UI wiring, labels, picking, render loop
vendor/three/                    vendored Three.js build + OrbitControls + CSS2DRenderer + RoomEnvironment (no CDN/network dependency)
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
