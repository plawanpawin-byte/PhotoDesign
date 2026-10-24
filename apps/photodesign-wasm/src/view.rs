//! The maths behind the canvas view, the command search and colour hex codes. Pure functions on
//! numbers and text, so the TypeScript interface calls them through the wasm bridge and the
//! native tests below pin their behaviour.

pub const MIN_ZOOM: f64 = 0.01;
pub const MAX_ZOOM: f64 = 64.0;

/// Zoom steps the +/- buttons and keys walk through.
pub const ZOOM_STEPS: [f64; 24] = [
    0.01, 0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0, 24.0, 32.0, 48.0, 64.0,
];

/// Rounds half up, like the interface's other number formatting.
fn round(v: f64) -> f64 {
    (v + 0.5).floor()
}

pub fn clamp_zoom(zoom: f64) -> f64 {
    if !zoom.is_finite() || zoom <= 0.0 { 1.0 } else { zoom.clamp(MIN_ZOOM, MAX_ZOOM) }
}

/// `[zoom, x, y]` with the document centred in the viewport at `zoom`.
pub fn centre(doc_w: f64, doc_h: f64, view_w: f64, view_h: f64, zoom: f64) -> [f64; 3] {
    let z = clamp_zoom(zoom);
    [z, round((view_w - doc_w * z) / 2.0), round((view_h - doc_h * z) / 2.0)]
}

/// The whole document centred with `margin` screen pixels around it, never above 100%.
pub fn fit(doc_w: f64, doc_h: f64, view_w: f64, view_h: f64, margin: f64) -> [f64; 3] {
    let w = (view_w - margin * 2.0).max(1.0);
    let h = (view_h - margin * 2.0).max(1.0);
    let zoom = clamp_zoom((w / doc_w.max(1.0)).min(h / doc_h.max(1.0)).min(1.0));
    centre(doc_w, doc_h, view_w, view_h, zoom)
}

/// `[zoom, x, y]` after zooming to `zoom`, keeping the document point under the screen point
/// `(ax, ay)` where it is. `view` is `[zoom, x, y]` before.
pub fn zoom_at(view: [f64; 3], zoom: f64, ax: f64, ay: f64) -> [f64; 3] {
    let z = clamp_zoom(zoom);
    let (dx, dy) = ((ax - view[1]) / view[0], (ay - view[2]) / view[0]);
    [z, ax - dx * z, ay - dy * z]
}

/// The next zoom step in `direction` (positive in, otherwise out) from `zoom`.
pub fn step_zoom(zoom: f64, direction: i32) -> f64 {
    if direction > 0 {
        ZOOM_STEPS.iter().copied().find(|s| *s > zoom * 1.001).unwrap_or(MAX_ZOOM)
    } else {
        ZOOM_STEPS.iter().rev().copied().find(|s| *s < zoom / 1.001).unwrap_or(MIN_ZOOM)
    }
}

/// `150%`, `12.5%`, `5%`.
pub fn format_zoom(zoom: f64) -> String {
    let pct = zoom * 100.0;
    if pct >= 10.0 {
        return format!("{}%", round(pct));
    }
    let tenths = round(pct * 10.0);
    format!("{}%", tenths / 10.0)
}

fn word_break(c: char) -> bool {
    c.is_whitespace() || matches!(c, '.' | '/' | '>' | '_' | '-' | '…')
}

/// Score of `query` against `text` for the command search, or -1 when it doesn't match: every
/// query character must appear in order, and earlier, consecutive and word-start matches score
/// higher. Case-insensitive.
pub fn fuzzy_score(query: &str, text: &str) -> f64 {
    let q: Vec<char> = query.trim().to_lowercase().chars().collect();
    if q.is_empty() {
        return 0.0;
    }
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let at_word_start = |i: usize| i == 0 || word_break(t[i - 1]);
    if let Some(direct) = t.windows(q.len()).position(|w| w == q.as_slice()) {
        let bonus = if at_word_start(direct) { 200.0 } else { 0.0 };
        return 1000.0 - direct as f64 * 2.0 - (t.len() - q.len()) as f64 * 0.1 + bonus;
    }
    let (mut total, mut at, mut run) = (0.0, 0usize, 0u32);
    for ch in q {
        if ch == ' ' {
            continue;
        }
        let Some(i) = t[at..].iter().position(|c| *c == ch).map(|p| p + at) else { return -1.0 };
        run = if i == at { run + 1 } else { 0 };
        total += 10.0 + f64::from(run) * 5.0 + if at_word_start(i) { 15.0 } else { 0.0 } - (i - at) as f64 * 0.5;
        at = i + 1;
    }
    total
}

/// `#rrggbb` for 0..1 channels; anything not finite counts as 0.
pub fn to_hex(r: f64, g: f64, b: f64) -> String {
    let part = |v: f64| round(if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 } * 255.0) as u8;
    format!("#{:02x}{:02x}{:02x}", part(r), part(g), part(b))
}

/// `#rgb` or `#rrggbb` as 0..1 channels; `None` for anything else.
pub fn from_hex(hex: &str) -> Option<[f64; 3]> {
    let h = hex.trim().strip_prefix('#').unwrap_or(hex.trim());
    if !h.is_ascii() || !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let full: String = match h.len() {
        3 => h.chars().flat_map(|c| [c, c]).collect(),
        6 => h.to_string(),
        _ => return None,
    };
    let n = u32::from_str_radix(&full, 16).ok()?;
    Some([f64::from((n >> 16) & 255) / 255.0, f64::from((n >> 8) & 255) / 255.0, f64::from(n & 255) / 255.0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zoom_is_clamped_and_bad_values_reset() {
        assert_eq!(clamp_zoom(1000.0), MAX_ZOOM);
        assert_eq!(clamp_zoom(0.0001), MIN_ZOOM);
        assert_eq!(clamp_zoom(f64::NAN), 1.0);
        assert_eq!(clamp_zoom(-3.0), 1.0);
    }

    #[test]
    fn fit_shrinks_big_documents_but_never_enlarges() {
        let big = fit(4000.0, 2000.0, 1000.0, 800.0, 48.0);
        assert!((big[0] - 904.0 / 4000.0).abs() < 1e-9);
        assert_eq!(fit(100.0, 100.0, 1000.0, 800.0, 48.0)[0], 1.0);
    }

    #[test]
    fn centre_puts_the_document_in_the_middle() {
        assert_eq!(centre(200.0, 100.0, 1000.0, 600.0, 1.0), [1.0, 400.0, 250.0]);
    }

    #[test]
    fn zoom_at_keeps_the_anchor_point_fixed() {
        let before = [1.0, 100.0, 50.0];
        let after = zoom_at(before, 4.0, 300.0, 250.0);
        let doc = ((300.0 - before[1]) / before[0], (250.0 - before[2]) / before[0]);
        assert!((after[1] + doc.0 * after[0] - 300.0).abs() < 1e-9);
        assert!((after[2] + doc.1 * after[0] - 250.0).abs() < 1e-9);
    }

    #[test]
    fn steps_walk_the_table_both_ways() {
        assert_eq!(step_zoom(1.0, 1), 1.5);
        assert_eq!(step_zoom(1.0, -1), 0.6667);
        assert_eq!(step_zoom(64.0, 1), MAX_ZOOM);
        assert_eq!(step_zoom(0.01, -1), MIN_ZOOM);
    }

    #[test]
    fn zoom_prints_as_a_short_percentage() {
        assert_eq!(format_zoom(1.5), "150%");
        assert_eq!(format_zoom(0.125), "13%");
        assert_eq!(format_zoom(0.05), "5%");
        assert_eq!(format_zoom(0.0833), "8.3%");
    }

    #[test]
    fn search_needs_every_character_in_order() {
        assert_eq!(fuzzy_score("zzz", "Gaussian Blur"), -1.0);
        assert!(fuzzy_score("gb", "Gaussian Blur") > 0.0);
        assert_eq!(fuzzy_score("  ", "anything"), 0.0);
    }

    #[test]
    fn search_prefers_early_whole_word_matches() {
        assert!(fuzzy_score("blur", "Blur") > fuzzy_score("blur", "Gaussian Blur"));
        assert!(fuzzy_score("blur", "Gaussian Blur") > fuzzy_score("blr", "Gaussian Blur"));
    }

    #[test]
    fn hex_round_trips_and_rejects_junk() {
        assert_eq!(to_hex(1.0, 0.0, 0.5), "#ff0080");
        assert_eq!(to_hex(f64::NAN, 2.0, -1.0), "#00ff00");
        assert_eq!(from_hex("#fff"), Some([1.0, 1.0, 1.0]));
        assert_eq!(from_hex(" 00ff00 "), Some([0.0, 1.0, 0.0]));
        assert_eq!(from_hex("#12345"), None);
        assert_eq!(from_hex("zzzzzz"), None);
    }
}
