# PhotoDesign

A free, open-source image editor in pure Rust (egui on wgpu): layers, masks, adjustment layers,
layer styles, type, vectors, brushes and PSD files. Every action is a command, so the UI, the CLI
and agents drive the same engine.

PhotoDesign starts from [PhotoCraft](https://getartcraft.com/apps/photocraft) 0.15.1 by the ArtCraft
Team and its contributors (MIT OR Apache-2.0) and is being shaped with the look of Lunatic Design.
The ArtCraft name and logos are their trademarks and are not part of this repository.

## Status

Early work on top of the PhotoCraft base. Changes so far are listed in [CHANGES.md](CHANGES.md).

## Build

```
cargo run -p photocraft --release
```

The crate names still say `photocraft`; see `docs/development.md` for the full build, test and
control-channel instructions inherited from the base.

## Licence

MIT OR Apache-2.0 (see `LICENSE-MIT`, `LICENSE-APACHE`). Third-party material and its licences are
in `NOTICE` and `ATTRIBUTION.md`.
