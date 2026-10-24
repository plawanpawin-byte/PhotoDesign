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

## The new interface (TypeScript)

PhotoDesign has its own interface, written in TypeScript in [`web/`](web/) and hosted in an
Electron window in [`desktop/`](desktop/). It is not a copy of Photoshop's layout: a floating tool
capsule, a single inspector card with Layers / Adjust / History, a command finder (Ctrl+K) over all
935 engine actions, and a start screen with size presets. The editing engine stays Rust: the
`apps/photodesign-wasm` crate exposes it to TypeScript as WebAssembly, and every edit is an engine
command.

```
cd web && npm install && npm run engine && npm run build   # engine (Rust to wasm) + interface
cd ../desktop && npm install && npm start                   # the window
cd ../web && npm test                                       # interface tests, including the real engine
```

The native egui app (below) is still there and still builds.

## Build

```
cargo run -p photocraft --release
```

The crate names still say `photocraft`; see `docs/development.md` for the full build, test and
control-channel instructions inherited from the base.

## Licence

MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`). Third-party material and its licences are
in `NOTICE` and `ATTRIBUTION.md`.
