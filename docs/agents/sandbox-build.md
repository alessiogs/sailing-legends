# Building and browser-testing without npm

Some agent sandboxes can't reach the npm registry. Workaround used so far: sparse-clone Babylon.js
(`packages/dev/core`), generate its shader `.ts` files from `.fx` with the build-tools `BuildShader`, then
bundle with esbuild using `--alias:@babylonjs/core=<core/src> --alias:core=<core/src>` and a stub for
`draco3dgltf`. Headless Chromium (`--use-angle=swiftshader`) renders it at ~10 fps — fine for screenshots.
`window.__game` (typed as `GameTestHook` in `src/game/testHook.ts`) exposes `session`, `input`, `mode`, `start()`,
`angleDiff`, `autopilot`, `fastForward(sec)` for scripted browser tests; `window.__fps` is the frame rate.

