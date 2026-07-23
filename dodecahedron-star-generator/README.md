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

## File layout

```
index.html                     page shell, collapsible control panel, import map
spiral-prototype.html          Option B prototype: single face, standalone viewer (§13)
spiral-dodeca-prototype.html   Option B prototype: full 12-face sculpture, standalone viewer (§14)
src/geometry.js                 dodecahedron construction, per-face star math, adjacency-connection rule
src/ribbon.js                   spline-based ribbon geometry (precise dip depth + tangent-matched joins) between two arm tips
src/startube.js                  star tube cut short of every tip (5 open segments, flat cut edges the ribbons fuse into)
src/membrane.js                  thin triangulated fill surface for a star's interior
src/hexgrid.js                    clipped hexagonal-grid fill surface for a star's interior
src/hextexture.js                 procedural tileable hex-pattern canvas texture, applied as a bump map on ribbons
src/spiralarm.js                  Option B prototype: 5-arm spiral-star motif per face (§13), not yet wired into main.js
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
