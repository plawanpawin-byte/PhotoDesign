# Electron preview (development only)

Shows the PhotoDesign **web build** in an Electron window, so the UI can be checked without a
browser tab. The app is still native Rust (egui on wgpu); this folder is not part of the Cargo
workspace and is not a release or packaging target.

```
# 1. build the web version once (needs Rust, the wasm32 target and trunk)
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
cd apps/photocraft-web
trunk build --release        # writes ../../dist/web

# 2. open it
cd ../../tools/electron-preview
npm install
npm start
```

`PHOTODESIGN_WEB_DIST=<folder>` points it at another build folder. The window uses WebGPU where
available and WebGL2 otherwise. For everyday work `cargo run -p photocraft --release` is the real app.
