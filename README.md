# PhotoDesign

A free, open-source image editor in pure Rust (egui on wgpu): layers, masks, adjustment layers,
layer styles, type, vectors, brushes and PSD files. Every action is a command, so the UI, the CLI
and agents drive the same engine.

PhotoDesign starts from [PhotoCraft](https://getartcraft.com/apps/photocraft) 0.15.1 by the ArtCraft
Team and its contributors (MIT OR Apache-2.0) and is being shaped with the look of Lunatic Design.
The ArtCraft name and logos are their trademarks and are not part of this repository.

## Status

Early work on top of the PhotoCraft base. Changes so far are listed in [CHANGES.md](CHANGES.md).

## Tools

<h4>🧰 67 tools</h4>
Move · Artboard · Rectangular and Elliptical Marquee · Single Row Marquee · Single Column Marquee · Lasso · Polygonal Lasso · Magnetic Lasso · Object Selection · Quick Selection · Magic Wand · Crop · Perspective Crop · Slice · Slice Select · Frame · Eyedropper · Color Sampler · Ruler · Note · Count · Remove · Spot Healing Brush · Healing Brush · Patch · Content-Aware Move · Red Eye · Brush · Pencil · Mixer Brush · Color Replacement · Clone Stamp · Pattern Stamp · History Brush · Eraser · Background Eraser · Magic Eraser · Gradient · Paint Bucket · Blur · Sharpen · Smudge · Dodge · Burn · Sponge · Pen · Freeform Pen · Curvature Pen · Add Anchor Point · Delete Anchor Point · Convert Point · Horizontal and Vertical Type · Horizontal and Vertical Type Mask · Path Selection · Direct Selection · Rectangle · Ellipse · Triangle · Polygon · Line · Custom Shape · Hand · Rotate View · Zoom

## How it is built

| Part | Language | Where |
| --- | --- | --- |
| Interface: tools, panels, canvas, command finder, Thai and English | TypeScript | [`web/`](web/) |
| Desktop window | JavaScript (Electron) | [`desktop/`](desktop/) |
| Editing engine: documents, layers, brushes, filters, file formats, history | Rust | `crates/` |
| Bridge from the interface to the engine (WebAssembly) | Rust | [`apps/photodesign-wasm`](apps/photodesign-wasm) |
| Command line and agent (MCP) server | Rust | `apps/photocraft-cli`, `crates/automation` |

The interface is PhotoDesign's own design, not a copy of Photoshop's: a floating tool capsule, one
inspector card with Layers / Adjust / Image / History, a command finder (Ctrl+K) over every engine
action, a start screen with size presets, and a language switch (English, Thai). Every edit is an
engine command, so anything the interface does a script or an AI agent can do too.

The egui desktop interface inherited from PhotoCraft was removed; the engine did not depend on it.

## Build and run

```
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129

cd web
npm install
npm run engine      # Rust engine to WebAssembly
npm run build       # the interface, into web/dist
npm test            # interface tests, including the real engine

cd ../desktop
npm install
npm start           # the window
```

Engine tests: `cargo test -p photodesign-wasm`, or `cargo test --workspace`. The crates are still
named `photocraft-*`; renaming them would touch nearly every file. See `docs/development.md` for the
engine's own build and test notes (it predates the interface change, so skip its egui parts).

## Licence

MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`). Third-party material and its licences are
in `NOTICE` and `ATTRIBUTION.md`.

### Language share

`node scripts/lang-share.mjs` counts only the code written for PhotoDesign (the `web/` interface, the `desktop/` host and the `photodesign-wasm` bridge), not the PhotoCraft engine in `crates/`. The engine is about 19 MB of Rust and is reused as it is.
