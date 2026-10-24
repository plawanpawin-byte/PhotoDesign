# Changes from PhotoCraft 0.15.1

## Fixed

- **Tools no longer stack when switching to the Hand.** The Clone Stamp's source overlay was drawn
  from the *selected* tool, so holding Space (Hand), ⌘/Ctrl (Move), a zoom key or the middle button
  left the overlay under the temporary tool's pointer. It now follows the tool in effect: put one
  tool down, pick the next up. Test: `clone_overlay_is_put_down_with_the_clone_stamp`.

## Reported, not yet addressed

From the bug list sent with the source: rapid tool switching lags, no window snapping on Windows,
slow pen-pressure canvas with imported .ABR brushes, high CPU in 0.8.2, live font preview off in the
Pro themes, layer-name memory, VectorCraft files rasterised on import, no colour-space management,
no .exr export, unstable Remove / Content-Aware / Generative Fill. None of these could be reproduced
or profiled in a headless build, so they are open.

## Original interface in TypeScript

- `web/`: a new interface in TypeScript (Vite, no UI framework). Own layout, icons and styling in
  the Lunatic Design dark palette; 44 tests, including ones that drive the real Rust engine.
- `apps/photodesign-wasm/`: the engine bridge (`Studio`, 6 native tests), compiled to WebAssembly.
- `desktop/`: Electron window for the interface.
- The default theme of the egui app now uses the Lunatic palette.
