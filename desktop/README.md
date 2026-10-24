# PhotoDesign desktop (Electron)

Opens the PhotoDesign interface (`web/`, TypeScript) in its own window. The editing engine is the
Rust code in `crates/`, compiled to WebAssembly by `apps/photodesign-wasm`.

```
# once: Rust with the wasm32 target, and wasm-bindgen-cli at the version in Cargo.lock
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129

cd web
npm install
npm run engine      # builds the Rust engine for WebAssembly
npm run build       # builds the interface into web/dist

cd ../desktop
npm install
npm start
```

`PHOTODESIGN_WEB_DIST=<folder>` points the window at another build. The page is served on
127.0.0.1 only, on a random port, while the window is open.

## Installer (.exe)

```
cd desktop
npm run dist
```

Builds the engine with full optimisation, the interface, then `release/PhotoDesign-Setup-<version>.exe`
(installer) and `release/PhotoDesign-Portable-<version>.exe` (runs without installing). The
installed app needs neither Rust nor Node.

GitHub builds the same two files on every push (workflow "Desktop app"); download them from the
run's artifacts. Pushing a `v*` tag also attaches them to a release.
