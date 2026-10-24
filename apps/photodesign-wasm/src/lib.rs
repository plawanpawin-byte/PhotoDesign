//! PhotoDesign's engine bridge: the Rust engine (documents, layers, brushes, filters, file
//! formats, history) behind a small API for the TypeScript UI in `web/`.
//!
//! [`Studio`] is plain Rust so it can be tested natively; on `wasm32` the [`web`] module wraps it
//! with wasm-bindgen. Every action goes through the engine's command registry, so the UI can do
//! anything the CLI, the control channel or an agent can.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

pub mod imaging;
pub mod view;

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

/// `files` as `u32 count`, then per file `u32 name length, name, u32 data length, data` (little-endian).
fn pack_files(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&(files.len() as u32).to_le_bytes());
    for (name, data) in files {
        out.extend_from_slice(&(name.len() as u32).to_le_bytes());
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(data);
    }
    out
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

    /// Opens a file's bytes as a new document; `name` picks the format by its extension. `path` is
    /// where the bytes came from, kept so that saving without a path writes back to it.
    pub fn open(&mut self, name: &str, bytes: &[u8], path: Option<String>) -> Result<Value, String> {
        file_cmds::open_bytes_as(&mut self.session, name, bytes, None, path).map_err(|e| e.to_string())
    }

    /// The files a file-writing export command would make, as bytes instead of paths (the web has no
    /// file system; the host writes them). `kind` is `layers` (Layers to Files) or `dataSets`
    /// (Export Data Sets); `params` are the command's own. Packed as `u32 count`, then per file
    /// `u32 name length, name, u32 data length, data`, all little-endian.
    pub fn export_files(&self, kind: &str, params: &Value) -> Result<Vec<u8>, String> {
        let mut files: Vec<(String, Vec<u8>)> = Vec::new();
        let mut keep = |name: &str, bytes: &[u8]| {
            files.push((name.to_string(), bytes.to_vec()));
            Ok(())
        };
        match kind {
            "layers" => file_cmds::export_layers_with(&self.session, params, &mut keep),
            "dataSets" => photocraft_engine::export_data_sets_with(&self.session, params, &mut keep),
            other => return Err(format!("export_files: unknown kind `{other}` (layers or dataSets)")),
        }
        .map_err(|e| e.to_string())?;
        Ok(pack_files(&files))
    }

    /// The file the active document may be saved back to when no path is given: its own, and only
    /// when that is a layered format (PSD, PSB, OpenRaster, .pcraft) that holds the whole document,
    /// so a flat copy never replaces the original. The error says why not and what to do.
    pub fn write_back_path(&self) -> Result<String, String> {
        let d = self.session.active().ok_or("no open document")?;
        let Some(path) = d.path.as_deref() else {
            return Err("document has no path; pass `path`".into());
        };
        if !file_cmds::holds_at(&d.doc, path) {
            let lost = file_cmds::losses_at(&d.doc, path);
            let why = if lost.is_empty() { String::new() } else { format!(" (it can't keep: {})", lost.join("; ")) };
            return Err(format!("pass `path`: without one, only a PSD, PSB, .pcraft or OpenRaster file that holds the whole document is written back, in its own format, so `{path}` was left unchanged{why}"));
        }
        Ok(path.to_string())
    }

    /// Imports a data set CSV whose text the host already read (`file.import.variableDataSets`).
    pub fn import_data_sets(&mut self, text: &str, params: &Value) -> Result<Value, String> {
        photocraft_engine::import_data_sets_text(&mut self.session, text, params).map_err(|e| e.to_string())
    }

    /// Places a file's bytes as a Smart Object layer in the active document; `params` carries the
    /// command's own options (`scale`, `fit`, `center`).
    pub fn place(&mut self, name: &str, bytes: Vec<u8>, params: &Value) -> Result<Value, String> {
        file_cmds::place_bytes(&mut self.session, name, bytes, None, params).map_err(|e| e.to_string())
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

    fn object_params(what: &str, params: &str) -> Result<serde_json::Value, JsError> {
        if params.trim().is_empty() { Ok(serde_json::json!({})) } else { serde_json::from_str(params).map_err(|e| fail(format!("{what}: the parameters are not JSON: {e}"))) }
    }

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
        pub fn open(&mut self, name: &str, bytes: &[u8], path: Option<String>) -> Result<String, JsError> {
            self.studio.open(name, bytes, path).map(|v| v.to_string()).map_err(fail)
        }
        pub fn export_files(&self, kind: &str, params: &str) -> Result<Vec<u8>, JsError> {
            let params = object_params("exportFiles", params)?;
            self.studio.export_files(kind, &params).map_err(fail)
        }
        pub fn write_back_path(&self) -> Result<String, JsError> {
            self.studio.write_back_path().map_err(fail)
        }
        pub fn import_data_sets(&mut self, text: &str, params: &str) -> Result<String, JsError> {
            let params = object_params("importDataSets", params)?;
            self.studio.import_data_sets(text, &params).map(|v| v.to_string()).map_err(fail)
        }
        pub fn place(&mut self, name: &str, bytes: &[u8], params: &str) -> Result<String, JsError> {
            let params: serde_json::Value = if params.trim().is_empty() { serde_json::json!({}) } else { serde_json::from_str(params).map_err(|e| fail(format!("place: the parameters are not JSON: {e}")))? };
            self.studio.place(name, bytes.to_vec(), &params).map(|v| v.to_string()).map_err(fail)
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

    /// Previews engine command `command` (slider values as a JSON object) on a copy of `rgba`.
    /// Returns the input unchanged for a command with no preview.
    #[wasm_bindgen]
    pub fn preview_pixels(command: &str, values: &str, rgba: &[u8], width: u32, height: u32, scale: f64) -> Result<Vec<u8>, JsError> {
        let values: crate::imaging::Values = serde_json::from_str(values).map_err(|e| fail(format!("{command}: bad values: {e}")))?;
        let mut px = rgba.to_vec();
        crate::imaging::preview(command, &values, &mut px, width as usize, height as usize, scale);
        Ok(px)
    }

    /// 1024 counts: red, green, blue and luma bins, 256 each.
    #[wasm_bindgen]
    pub fn tone_histogram(rgba: &[u8]) -> Vec<u32> {
        crate::imaging::histogram(rgba).flat()
    }

    /// `[zoom, x, y]` with the document centred in the viewport.
    #[wasm_bindgen]
    pub fn view_centre(doc_w: f64, doc_h: f64, view_w: f64, view_h: f64, zoom: f64) -> Vec<f64> {
        crate::view::centre(doc_w, doc_h, view_w, view_h, zoom).to_vec()
    }

    /// `[zoom, x, y]` fitting the whole document in the viewport.
    #[wasm_bindgen]
    pub fn view_fit(doc_w: f64, doc_h: f64, view_w: f64, view_h: f64, margin: f64) -> Vec<f64> {
        crate::view::fit(doc_w, doc_h, view_w, view_h, margin).to_vec()
    }

    /// `[zoom, x, y]` after zooming around a screen point.
    #[wasm_bindgen]
    pub fn view_zoom_at(zoom: f64, x: f64, y: f64, to: f64, anchor_x: f64, anchor_y: f64) -> Vec<f64> {
        crate::view::zoom_at([zoom, x, y], to, anchor_x, anchor_y).to_vec()
    }

    #[wasm_bindgen]
    pub fn view_clamp_zoom(zoom: f64) -> f64 {
        crate::view::clamp_zoom(zoom)
    }

    #[wasm_bindgen]
    pub fn view_step_zoom(zoom: f64, direction: i32) -> f64 {
        crate::view::step_zoom(zoom, direction)
    }

    #[wasm_bindgen]
    pub fn view_format_zoom(zoom: f64) -> String {
        crate::view::format_zoom(zoom)
    }

    /// Command-search score, -1 when the query doesn't match.
    #[wasm_bindgen]
    pub fn fuzzy_score(query: &str, text: &str) -> f64 {
        crate::view::fuzzy_score(query, text)
    }

    #[wasm_bindgen]
    pub fn colour_to_hex(r: f64, g: f64, b: f64) -> String {
        crate::view::to_hex(r, g, b)
    }

    /// 0..1 channels for a hex colour, or an empty array when it isn't one.
    #[wasm_bindgen]
    pub fn colour_from_hex(hex: &str) -> Vec<f64> {
        crate::view::from_hex(hex).map(|c| c.to_vec()).unwrap_or_default()
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
        s.open("again.png", &png, None).unwrap();
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
    fn open_keeps_the_path_it_came_from() {
        let mut s = studio_with_canvas(4, 4);
        let png = s.export("png").unwrap();
        s.open("again.png", &png, Some("C:/Docs/again.png".into())).unwrap();
        let state = s.state();
        assert_eq!(state["session"]["documents"][1]["path"], "C:/Docs/again.png");
        assert!(state["session"]["documents"][0]["path"].is_null());
    }

    /// The packed files, back as (name, length).
    fn unpack(bytes: &[u8]) -> Vec<(String, usize)> {
        let u32_at = |at: usize| u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        let (mut at, mut out) = (4, Vec::new());
        for _ in 0..u32_at(0) {
            let n = u32_at(at);
            let name = String::from_utf8(bytes[at + 4..at + 4 + n].to_vec()).unwrap();
            at += 4 + n;
            let len = u32_at(at);
            at += 4 + len;
            out.push((name, len));
        }
        assert_eq!(at, bytes.len(), "no trailing bytes");
        out
    }

    #[test]
    fn layers_export_as_bytes_without_a_file_system() {
        let mut s = studio_with_canvas(8, 8);
        s.execute("layer.duplicate", "{}").unwrap();
        let files = unpack(&s.export_files("layers", &json!({"format": "png", "prefix": "p"})).unwrap());
        assert_eq!(files.len(), 2, "background and its copy: {files:?}");
        assert!(files.iter().all(|(n, len)| n.starts_with("p") && n.ends_with(".png") && *len > 8), "{files:?}");
        assert!(s.export_files("nope", &json!({})).is_err());
        assert!(Studio::new().export_files("layers", &json!({})).is_err(), "no document");
    }

    #[test]
    fn data_set_files_need_a_document_and_data_sets() {
        let mut s = studio_with_canvas(8, 8);
        let err = s.export_files("dataSets", &json!({})).unwrap_err();
        assert!(err.contains("no data sets"), "{err}");
        assert!(Studio::new().import_data_sets("title\nA\n", &json!({})).is_err(), "no document");
    }

    #[test]
    fn saving_without_a_path_writes_back_only_to_a_layered_file() {
        let mut s = studio_with_canvas(4, 4);
        assert!(s.write_back_path().unwrap_err().contains("no path"));
        let psd = s.export("psd").unwrap();
        s.open("a.psd", &psd, Some("C:/Docs/a.psd".into())).unwrap();
        assert_eq!(s.write_back_path().unwrap(), "C:/Docs/a.psd");
        let png = s.export("png").unwrap();
        s.open("a.png", &png, Some("C:/Docs/a.png".into())).unwrap();
        assert!(s.write_back_path().unwrap_err().contains("left unchanged"));
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
        assert!(s.open("broken.png", b"definitely not a png", None).is_err());
        assert!(s.revision().is_none());
        let mut s = studio_with_canvas(4, 4);
        assert!(s.render(0).is_ok(), "a zero side is clamped");
        assert!(s.execute("paint.stroke", r#"{"points":"nope"}"#).is_err());
    }
}
