# Void: journey rework plan

The working document for the "review the whole journey" pass. If a session
runs out, the next model should be able to pick up from here: read this file,
then the **Status** section at the bottom, then continue with the first
unchecked item.

## What the piece is

A single continuous zoom (Three.js, Vite, no framework) from a person standing
still on the ground, out through their place, the coast, the turning Earth,
the Moon, the year, the planets, the Sun's motion, the galaxy, and the
universe. Copy is in English and Arabic (`src/i18n.js`). Deployed on
Cloudflare Workers at void.bynoor.io.

| File | Role |
| --- | --- |
| `src/main.js` | Timeline: `CUES` map play time (seconds) to zoom `u` (0..1), phase lines, input (wheel, drag, keys, scrub), UI state, the frame loop. |
| `src/world.js` | The whole scene: Earth, Moon, planets, Sun, galaxy, stars, camera framing `frame()`, all per-frame fades in `render()`. |
| `src/figure.js` | The walking person (IK legs, walk path, turns). Tested. |
| `src/motion.js` | Monotone cubic interpolator used for every zoom curve (no stalls at cues). |
| `src/orbits.js` | Kepler and galactic rotation ratios. Tested. |
| `src/sound.js` | WebAudio score: drone, bells per phase, footsteps, whoosh. |
| `src/style.css` | Literata + Amiri type, copy bottom-left, dock top-right. |
| `tests/physics.test.mjs` | `npm test`. Keep green. |
| `tools/cap.mjs`, `tools/sheet.mjs` | Headless frame capture and contact sheets (see Verification). |

## Story arc (target)

The emotional thread is **you**: one warm light that never goes out. The
person shrinks into an ember; the ember stays on screen, marking where you
are, at every scale, to the edge of everything. At the end the universe
fades and only that ember is left, and the last line answers the first.
Then you can fly home and land where you started, still standing there.

| Key | u from | Beat | Line (en) |
| --- | --- | --- | --- |
| still | 0 | Dusk. A person, a long shadow, a few windows lit. | You have not moved yet. |
| step | 0.06 | The walk out toward the low sun. | The first motion is yours, and it is small. |
| place | 0.14 | Walking back home; the hamlet from above. | A place is what you can still walk back to. |
| coast | 0.24 | Rise; the sea appears beyond the walk; the sun sets on home. | The edge you could not see was a coastline. |
| spin | 0.36 | The globe turns; the terminator passes over home. | The world turns all the way around. |
| lights | 0.41 | Night side: city lights, home is one cluster. **new** | Every light down there is someone's evening. |
| moon | 0.46 | The Moon. | Something else is falling, and it never lands. |
| year | 0.52 | Earth on its orbit, now smaller than the Sun. | You are not the center. You are riding one. |
| planets | 0.60 | Inner world laps, outer world crawls. | The fall is not a single circle. |
| dot | 0.66 | Earth is a point of light by the Sun. **new** | Everyone you have ever known is on that point. |
| sun | 0.72 | The solar system shrinks into a star among stars. | The center you found is leaving too. |
| disk | 0.78 | The galaxy turns; inside pulls ahead. | The whole disk turns. The inside pulls ahead. |
| galaxies | 0.86 | Andromeda; the Local Group. | Past this, the motions stop sharing a center. |
| end | 0.94 | The cosmic web, then everything fades. | There is no middle left to stand in. |
| coda | 0.985 | Only the ember remains. **new** | And somewhere in all of it, you. |

## Review findings (before this pass)

Captured with `tools/cap.mjs` at 21 time points (1280x720).

### Accuracy

1. **Earth is bigger than the Sun** once both are on screen (t 64 to 100):
   `EARTH_R = 400`, `SUN_R = 280` in `src/world.js`. No scale relay exists,
   so the Earth stays full size next to the Sun.
2. **The solar system is a third of the galaxy.** Outer orbit 3480 inside a
   12000 galaxy radius; at the disk phase the planet orbits are big rings
   across the spiral.
3. **Field stars are a fixed sphere of radius 180000 at the origin**, and the
   camera ends at 250000, so it flies out of the star field. The field
   stars belong to our galaxy and should fade as we leave it.
4. **Atmosphere renders as a hard grey ring** (a lens edge): the back-side
   fresnel shell is brightest at its own outer silhouette instead of fading
   to zero there.
5. **Terminator band is an opaque orange stripe** across the globe.
6. **The real Sun mesh can sit in the opening sky at 9 degrees radius** (fog
   is off for it). Nothing ties the opening light to the real Sun.
7. **Andromeda is named in the copy but not in the scene.** The "universe" is
   160 dots.
8. Galaxy star field has a hard 2400-unit empty bubble around the Sun.
9. Disclaimer says only sizes are shortened; times are compressed too
   (16 days per year, 5.3 months per year).
10. Coastlines are a few hand-drawn blobs; at globe scale they read as clip
    art, not land.

### Transitions

11. Person to planet: the 3D spark sprite is the only hand-over and it is
    gone by the spin phase. Nothing carries "you" further.
12. Earth to Sun: the camera target moves from Earth to Sun while both are
    the same size, so it reads as two balls side by side, not a pull-back.
13. Sun to galaxy: the solar system never shrinks, so there's no moment
    where the Sun becomes one star among many.
14. Galaxy to universe: the galaxy just fades to a smudge; the end is a
    black screen.
15. Phase text swaps with a flat 220 ms opacity blink.

### Feeling

16. The opening is flat beige light with no direction: no time of day, no
    shadow, nothing that says home.
17. "Us" never appears: no other people, no lights, no sense that everyone is
    on that ground.
18. The ending is cold: black screen, "Play again".

## Plan

Order is by impact. Each item names the files it touches.

### A. Accuracy and scale relay (`src/world.js`)

- [x] A1. Earth system scale relay: `earthPivot.scale` holds 1 to u 0.50,
      then eases (log) to about 0.05 by u 0.66. Scale every Earth-radius use
      (pushOut, alt, atmosphere radius, horizon test) by it. The Sun is
      then clearly larger than the Earth by the year phase.
- [x] A2. Solar system relay: wrap Sun, glow and `solarGroup` in a `system`
      group; scale 1 to u 0.72, down to about 0.025 by u 0.86. Sun glow keeps
      a minimum pixel size so the Sun reads as one star among the
      neighbours.
- [x] A3. Field stars follow the camera (a sky at infinity) and fade out as
      we leave the galaxy (u 0.84 to 0.92).
- [x] A4. Atmosphere: ray closest-approach shader, brightest just above the
      limb, zero at the outer edge, cool blue on the day side, warm at the
      twilight edge.
- [x] A5. Procedural Earth surface shader: fbm continents with a coast
      forced near home (land at home, sea beyond the walk), ocean depth and
      shelf, land tones, ice caps, terminator warmth limited to a thin
      scattering band, ocean glint, procedural city lights on the night
      side with a bright cluster at home. Octaves fade with screen
      derivative so the far globe does not shimmer.
- [x] A6. Procedural clouds (fbm, drifting, lit by the Sun, kept off home).
- [x] A7. Hide the real Sun mesh and Moon in the opening sky; draw the low
      sun in a sky dome instead.
- [x] A8. Shrink the galaxy's empty bubble around the Sun.
- [x] A9. Andromeda as a second, larger, inclined spiral; a cosmic web of
      several thousand galaxies along filaments for the end.
- [x] A10. Disclaimer: "Sizes and times are compressed so the motion stays
      visible." (en and ar).

### B. Story and feeling

- [x] B1. Dusk opening (`src/world.js`): one physical sun direction drives
      the light. Earth's starting spin is solved at load so home sits at
      about 15 degrees sun elevation on the evening side; the local frame is
      turned so the low sun is ahead-left of the walk. The solar clock
      barely moves during the walk and only speeds up as we rise, so the
      sun sets on home during the coast phase and the lights come on.
- [x] B2. Sky dome for the opening: dusty blue zenith, warm horizon, glow
      and small disc at the real sun direction; fog takes the horizon
      colour; fades to space as altitude grows.
- [x] B3. Soft shadows for the figure and houses from the key light
      (shadow map updates only while it matters).
- [x] B4. Window lights in the hamlet that switch on one by one as the sun
      drops. The hamlet hands over to the bright home cluster in the
      Earth's night lights.
- [x] B5. The ember (`index.html`, `src/main.js`, `src/style.css`,
      `src/world.js`): a DOM light that sits above the veil at the
      projected position of the person, appears as the figure shrinks,
      hides behind the Earth's horizon or the Sun, slides to the Earth's
      centre once the globe is small, and breathes slowly. A quiet "you"
      label from the dot phase onward.
- [x] B6. New lines `lights`, `dot`, `coda`; retime `CUES` so each beat has
      eight to twelve seconds; update reduced-motion step marks and sound
      bell marks to the new boundaries.
- [x] B7. Ending: the web fades, the veil comes down, the ember stays. The
      coda line, then **Go home**: an eased flight back through the whole
      zoom to t = 0, where the first line, "You have not moved yet.", is
      now true in a new way.

### C. Interface (`src/main.js`, `src/style.css`, `index.html`)

- [x] C1. Line transitions: outgoing line lifts and blurs out; incoming
      words rise and clear in sequence, stat follows. Fast scrubbing swaps
      without animation. Reduced motion: plain swap.
- [x] C2. Live scale readout at the top inline-start: the real width of the
      view, "4 meters across" to "93 billion light-years across", two
      significant figures, tabular numerals, Arabic-Indic digits in Arabic.
- [x] C3. Coda state UI: note, Go home button; after landing, Play.

### D. Sound (`src/sound.js`)

- [x] D1. Bells at the new phase boundaries.
- [x] D2. A warm swell at `dot` and at `coda`; a soft resolve on landing
      home.

## Verification

```bash
npm test
npx vite --port 5199 --strictPort &
npm i --no-save playwright-core
node tools/cap.mjs http://localhost:5199/ /tmp/voidcap/after "0,4,10,16,22,28,34,40,46,52,58,64,72,80,90,100,112,124,134,142,148"
node tools/sheet.mjs /tmp/voidcap/after /tmp/voidcap/after-sheet.png 3
```

`cap.mjs` loads `?t=<seconds>` (the app integrates the clocks up to that time)
and screenshots after 1.8 s. Chrome path comes from `CHROME` or the local
Playwright cache. Software GL (SwiftShader) is slow but deterministic.
Also check `&lang=ar`, a 390x844 viewport, and reduced motion.

## Status

- 2026-11-18: Review done, plan written.
- 2026-11-18: First full implementation pass landed (all items in A to D).
  New file `src/shaders.js` holds the Earth, cloud, atmosphere and sky
  shaders. Notes for whoever continues:
  - `world.js` `calibrate()` solves the opening at load (Earth spin so the
    Sun is 12.6° up and setting over home; home frame turned so the Sun is
    behind-right of the camera). `SUN_ELEVATION`, `SUN_AZIMUTH` tune it.
  - Sunset over home lands at ~35 s (u ≈ 0.305), mid coast phase, set by
    `solarRate()`. The ink switch in `main.js` `applySky` (u < 0.305) must
    follow it. Re-check with a quick simulation if `CUES` or the rate change.
  - Clocks integrate along real time (`integrate(t0, t1, timeToU)`), so
    `?t=` captures and scrubs land on the same sky as playing through.
  - Camera up: home normal, then the ecliptic normal (u 0.36 to 0.58), then
    70% toward the galaxy normal (u 0.74 to 0.88). The person-to-planet
    handover swings around the Earth's centre (`slerpUnit`) so it never
    passes through the globe.
  - The ember is a DOM element (`#ember`) positioned from
    `world.render().ember`; it sits above `#veil`.

- 2026-11-18: Second pass after a full capture review.
  - Ink is adaptive: the renderer reads back three thin pixel rows behind
    the copy and behind the dock every 10 frames (`sampleLuma`), and
    `main.js` picks dark or light ink for each with hysteresis
    (`--ink`/`--halo` for the copy, `--chrome` for dock and readout).
  - The scale readout is the camera's real span times the meters-per-unit
    of the frame that owns the view (`METERS_PER_UNIT` in `main.js`).
  - Andromeda is a steep oval (69° from face-on), not additive.
  - `tools/flight.mjs` captures the Go home flight.

### Verified

- [x] Fly-home flight lands at t = 0 with "You have not moved yet."
- [x] Arabic at 1280 (copy bottom-right, adaptive ink over the sea).
- [x] Phone 390x844: readout sits under the scrub bar.
- [x] Reduced motion: Farther steps phase by phase, plain swaps.

### Open

- [ ] The Moon can be behind the Earth during its own line (its phase
      angle is set by the solar clock; nudge `moonAngle` offset if needed).
- [ ] The Moon's compressed distance (1.6 Earth radii) disagrees with the
      readout during the moon phase; inherent to the compression.
- [ ] Performance on a real GPU (Earth shader fbm, 40k web points, shadow
      map updates until u 0.3). Captures here use SwiftShader.
- [ ] Sound: listen through once; the coda chord and flight sweep levels
      were set by reading, not by ear.
