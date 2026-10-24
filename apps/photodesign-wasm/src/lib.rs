//! PhotoDesign's engine bridge: the Rust engine (documents, layers, brushes, filters, file
//! formats, history) behind a small API for the TypeScript UI in `web/`.
//!
//! [`Studio`] is plain Rust so it can be tested natively; on `wasm32` the [`web`] module wraps it
//! with wasm-bindgen. Every action goes through the engine's command registry, so the UI can do
//! anything the CLI, the control channel or an agent can.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

use photocraft_engine::{Session, command_specs, commands, file_cmds, inspect};
use serde_json::{Value, json};

/// Largest side of a rendered frame, in pixels.
pub const MAX_FRAME_SIDE: u32 = 8192;

/// A rendered view of the active document: straight-alpha RGBA, 8 bits per channel.
#[derive(Clone, Debug, PartialEq)]
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

/// One editing session: the open documents and the toolbox state.
#[derive(Default)]
pub struct Studio {
    session: Session,
}

impl Studio {
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs engine command `id` with `params`, a JSON object (empty means `{}`).
    pub fn execute(&mut self, id: &str, params: &str) -> Result<Value, String> {
        let params: Value = if params.trim().is_empty() { json!({}) } else { serde_json::from_str(params).map_err(|e| format!("{id}: the parameters are not JSON: {e}"))? };
        if !params.is_object() {
            return Err(format!("{id}: the parameters must be a JSON object"));
        }
        self.session.execute(id, params).map_err(|e| e.to_string())
    }

    /// Opens a file's bytes as a new document; `name` picks the format by its extension.
    pub fn open(&mut self, name: &str, bytes: &[u8]) -> Result<Value, String> {
        file_cmds::open_bytes_as(&mut self.session, name, bytes, None, None).map_err(|e| e.to_string())
    }

    /// Every command with its label, menu, shortcut, parameters and whether it can run now.
    pub fn commands(&self) -> Value {
        Value::Array(command_specs().iter().map(|c| commands::list_entry(&self.session, c, self.session.disabled_reason(c.id))).collect())
    }

    /// The open documents, the toolbox colours, and the active document's layers and history.
    pub fn state(&self) -> Value {
        json!({
            "session": inspect::session(&self.session),
            "document": self.session.active().map(inspect::document),
        })
    }

    /// Changes whenever the active document does; `None` without one. The UI re-renders on change.
    pub fn revision(&self) -> Option<u64> {
        self.session.active().map(|d| d.revision)
    }

    /// The active document's composite, scaled down so its longer side is at most `max_side`.
    pub fn render(&self, max_side: u32) -> Result<Frame, String> {
        let d = self.session.active().ok_or("no open document")?;
        let image = photocraft_compose::thumbnail(&d.doc, max_side.clamp(1, MAX_FRAME_SIDE));
        Ok(Frame { width: image.width, height: image.height, pixels: image.pixels })
    }

    /// The active document encoded as `name_or_ext` (`png`, `jpg`, `psd`, `pcraft`, a file name…).
    pub fn export(&self, name_or_ext: &str) -> Result<Vec<u8>, String> {
        let d = self.session.active().ok_or("no open document")?;
        photocraft_io::export(&d.doc, name_or_ext, &photocraft_io::ExportOptions::default()).map(|r| r.bytes).map_err(|e| e.to_string())
    }
}

#[cfg(target_arch = "wasm32")]
pub mod web {
    use wasm_bindgen::prelude::*;

    fn fail(message: String) -> JsError {
        JsError::new(&message)
    }

    #[wasm_bindgen]
    pub struct RenderedFrame {
        width: u32,
        height: u32,
        pixels: Vec<u8>,
    }

    #[wasm_bindgen]
    impl RenderedFrame {
        #[wasm_bindgen(getter)]
        pub fn width(&self) -> u32 {
            self.width
        }
        #[wasm_bindgen(getter)]
        pub fn height(&self) -> u32 {
            self.height
        }
        /// RGBA bytes, `width * height * 4` long.
        pub fn pixels(&self) -> Vec<u8> {
            self.pixels.clone()
        }
    }

    /// The engine, for JavaScript. Results are JSON strings.
    #[wasm_bindgen]
    pub struct Engine {
        studio: super::Studio,
    }

    impl Default for Engine {
        fn default() -> Self {
            Self::new()
        }
    }

    #[wasm_bindgen]
    impl Engine {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Engine {
            Engine { studio: super::Studio::new() }
        }
        pub fn execute(&mut self, id: &str, params: &str) -> Result<String, JsError> {
            self.studio.execute(id, params).map(|v| v.to_string()).map_err(fail)
        }
        pub fn open(&mut self, name: &str, bytes: &[u8]) -> Result<String, JsError> {
            self.studio.open(name, bytes).map(|v| v.to_string()).map_err(fail)
        }
        pub fn commands(&self) -> String {
            self.studio.commands().to_string()
        }
        pub fn state(&self) -> String {
            self.studio.state().to_string()
        }
        /// The active document's revision, or -1 without one.
        pub fn revision(&self) -> f64 {
            self.studio.revision().map_or(-1.0, |r| r as f64)
        }
        pub fn render(&self, max_side: u32) -> Result<RenderedFrame, JsError> {
            self.studio.render(max_side).map(|f| RenderedFrame { width: f.width, height: f.height, pixels: f.pixels }).map_err(fail)
        }
        pub fn export(&self, name_or_ext: &str) -> Result<Vec<u8>, JsError> {
            self.studio.export(name_or_ext).map_err(fail)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn studio_with_canvas(w: u32, h: u32) -> Studio {
        let mut s = Studio::new();
        s.execute("file.new", &format!(r#"{{"width":{w},"height":{h},"background":"white"}}"#)).unwrap();
        s
    }

    #[test]
    fn new_document_shows_up_in_state_and_renders_white() {
        let s = studio_with_canvas(40, 20);
        let state = s.state();
        assert_eq!(state["document"]["width"], 40);
        assert_eq!(state["document"]["height"], 20);
        assert!(!state["document"]["layers"].as_array().unwrap().is_empty());
        let frame = s.render(4096).unwrap();
        assert_eq!((frame.width, frame.height), (40, 20), "never upscaled");
        assert_eq!(frame.pixels.len(), 40 * 20 * 4);
        assert_eq!(&frame.pixels[..4], &[255, 255, 255, 255]);
    }

    #[test]
    fn render_scales_to_the_longer_side() {
        let s = studio_with_canvas(400, 100);
        let frame = s.render(100).unwrap();
        assert_eq!((frame.width, frame.height), (100, 25));
    }

    #[test]
    fn a_brush_stroke_paints_and_undo_takes_it_back() {
        let mut s = studio_with_canvas(32, 32);
        let before = s.revision();
        s.execute("paint.stroke", r##"{"points":[[2,16],[30,16]],"size":6,"hardness":1,"color":"#000000"}"##).unwrap();
        assert_ne!(s.revision(), before);
        let frame = s.render(32).unwrap();
        let at = |x: usize, y: usize| frame.pixels[(y * 32 + x) * 4];
        assert!(at(16, 16) < 40, "the stroke is dark");
        assert_eq!(at(16, 2), 255, "away from the stroke stays white");
        s.execute("edit.undo", "").unwrap();
        assert_eq!(s.render(32).unwrap().pixels[(16 * 32 + 16) * 4], 255);
    }

    #[test]
    fn exported_png_opens_again() {
        let mut s = studio_with_canvas(8, 6);
        let png = s.export("png").unwrap();
        assert_eq!(&png[..4], b"\x89PNG");
        s.open("again.png", &png).unwrap();
        assert_eq!(s.state()["session"]["documents"].as_array().unwrap().len(), 2);
        assert_eq!(s.state()["document"]["width"], 8);
    }

    #[test]
    fn commands_list_the_registry() {
        let s = Studio::new();
        let list = s.commands();
        let list = list.as_array().unwrap();
        assert!(list.len() > 500);
        let new = list.iter().find(|c| c["id"] == "file.new").unwrap();
        assert_eq!(new["enabled"], true);
        let stroke = list.iter().find(|c| c["id"] == "paint.stroke").unwrap();
        assert_eq!(stroke["enabled"], false, "no document yet");
    }

    #[test]
    fn bad_input_is_an_error_not_a_crash() {
        let mut s = Studio::new();
        assert!(s.render(100).is_err());
        assert!(s.export("png").is_err());
        assert!(s.execute("no.such.command", "{}").is_err());
        assert!(s.execute("file.new", "not json").is_err());
        assert!(s.execute("file.new", "[1,2]").is_err());
        assert!(s.execute("file.new", r#"{"width":-5}"#).is_err());
        assert!(s.open("broken.png", b"definitely not a png").is_err());
        assert!(s.revision().is_none());
        let mut s = studio_with_canvas(4, 4);
        assert!(s.render(0).is_ok(), "a zero side is clamped");
        assert!(s.execute("paint.stroke", r#"{"points":"nope"}"#).is_err());
    }
}
