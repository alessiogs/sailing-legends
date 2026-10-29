# Building and browser-testing without npm

Some agent sandboxes can't reach the npm registry. Workaround used so far: sparse-clone Babylon.js
(`packages/dev/core`), generate its shader `.ts` files from `.fx` with the build-tools `BuildShader`, then
bundle with esbuild using `--alias:@babylonjs/core=<core/src> --alias:core=<core/src>` and a stub for
`draco3dgltf`. Headless Chromium (`--use-angle=swiftshader`) renders it at ~10 fps — fine for screenshots.
`window.__game` (typed as `GameTestHook` in `src/game/testHook.ts`) exposes `session`, `input`, `mode`, `start()`,
`angleDiff`, `autopilot`, `fastForward(sec)` for scripted browser tests; `window.__fps` is the frame rate.


## The HUD no-overlap check
`scripts/hud-overlap.cjs` opens a race in headless Chromium and fails when two HUD boxes overlap, one is cut off by the
screen edge, text spills out of its box, a button is under 44 px or a control is covered. Every box of the HUD carries
`data-hud` in `index.html`, so a new box is checked as soon as it is marked. CI has no browser: run it by hand after any HUD
change, with the game built as above (the bundle and `main.css` next to `index.html`).

```
NODE_PATH=$(npm root -g) node scripts/hud-overlap.cjs <built site dir> [screenshot dir] [--lang=en,it] [--only=390x844]
```
It sails the Optimist, the 420 as Helm and the 420 as Crew at 390x844, 360x740, 844x390, 1024x600, 1280x720 and 1920x1080,
in both languages, with the Standings/map panel closed and open, as the race has it and in a worst case (8 standings rows, a
long message, and every status pill and panel line showing). It exits 1 and lists the problems if any check fails, and
writes a JPEG of each state to the screenshot directory. A full run takes several minutes with the software renderer;
`--only` and `--lang` narrow it. (Written in 0.6a but not yet run to a pass: expect to fix what it finds.)
