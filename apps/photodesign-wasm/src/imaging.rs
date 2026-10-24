//! Fast pixel work for the interface: tone histogram, colour adjustments, blur and sharpen on
//! straight-alpha RGBA bytes. The Adjust sliders preview through this before the change is
//! applied by the engine, so a slider drag stays smooth on large frames.

use std::collections::BTreeMap;

/// Slider values by name, as the interface sends them.
pub type Values = BTreeMap<String, f64>;

fn get(v: &Values, key: &str, default: f64) -> f64 {
    v.get(key).copied().unwrap_or(default)
}

fn clamp8(v: f64) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

/// Tone statistics: 256 bins each for red, green, blue and luma, plus the pixels counted.
/// Fully transparent pixels are skipped.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Histogram {
    pub r: [u32; 256],
    pub g: [u32; 256],
    pub b: [u32; 256],
    pub luma: [u32; 256],
    pub count: u32,
}

pub fn luma(r: f64, g: f64, b: f64) -> f64 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

pub fn histogram(rgba: &[u8]) -> Histogram {
    let mut h = Histogram { r: [0; 256], g: [0; 256], b: [0; 256], luma: [0; 256], count: 0 };
    for px in rgba.chunks_exact(4) {
        if px[3] == 0 {
            continue;
        }
        h.r[px[0] as usize] += 1;
        h.g[px[1] as usize] += 1;
        h.b[px[2] as usize] += 1;
        h.luma[clamp8(luma(f64::from(px[0]), f64::from(px[1]), f64::from(px[2]))) as usize] += 1;
        h.count += 1;
    }
    h
}

impl Histogram {
    /// `[r…, g…, b…, luma…]`, 1024 values, for handing to JavaScript.
    pub fn flat(&self) -> Vec<u32> {
        [&self.r, &self.g, &self.b, &self.luma].into_iter().flat_map(|bins| bins.iter().copied()).collect()
    }
}

/// The levels below and above which `fraction` of the pixels in `bins` lie.
pub fn clip_points(bins: &[u32; 256], fraction: f64) -> (usize, usize) {
    let total: u64 = bins.iter().map(|&n| u64::from(n)).sum();
    if total == 0 {
        return (0, 255);
    }
    let cut = total as f64 * fraction;
    let (mut acc, mut low) = (0.0, 0);
    while low < 255 {
        acc += f64::from(bins[low]);
        if acc > cut {
            break;
        }
        low += 1;
    }
    let (mut acc, mut high) = (0.0, 255);
    while high > low {
        acc += f64::from(bins[high]);
        if acc > cut {
            break;
        }
        high -= 1;
    }
    (low, high)
}

fn each(px: &mut [u8], mut f: impl FnMut(f64, f64, f64) -> (f64, f64, f64)) {
    for p in px.chunks_exact_mut(4) {
        let (r, g, b) = f(f64::from(p[0]), f64::from(p[1]), f64::from(p[2]));
        p[0] = clamp8(r);
        p[1] = clamp8(g);
        p[2] = clamp8(b);
    }
}

pub fn brightness_contrast(px: &mut [u8], brightness: f64, contrast: f64) {
    let c = contrast * 2.55;
    let k = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
    let shift = brightness * 1.2;
    each(px, |r, g, b| (k * (r - 128.0) + 128.0 + shift, k * (g - 128.0) + 128.0 + shift, k * (b - 128.0) + 128.0 + shift));
}

pub fn exposure_gamma(px: &mut [u8], stops: f64, gamma: f64) {
    let gain = 2f64.powf(stops);
    let inv = 1.0 / gamma.max(0.01);
    let lut: Vec<u8> = (0..256).map(|i| clamp8(255.0 * (f64::from(i) / 255.0 * gain).min(1.0).powf(inv))).collect();
    each(px, |r, g, b| (f64::from(lut[r as usize]), f64::from(lut[g as usize]), f64::from(lut[b as usize])));
}

pub fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let (r, g, b) = (r / 255.0, g / 255.0, b / 255.0);
    let (max, min) = (r.max(g).max(b), r.min(g).min(b));
    let l = (max + min) / 2.0;
    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if (max - r).abs() < f64::EPSILON {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if (max - g).abs() < f64::EPSILON {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
    let h = h.rem_euclid(360.0) / 360.0;
    if s == 0.0 {
        return (l * 255.0, l * 255.0, l * 255.0);
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let f = |t: f64| {
        let t = (t + 1.0) % 1.0;
        255.0
            * if t < 1.0 / 6.0 {
                p + (q - p) * 6.0 * t
            } else if t < 0.5 {
                q
            } else if t < 2.0 / 3.0 {
                p + (q - p) * (2.0 / 3.0 - t) * 6.0
            } else {
                p
            }
    };
    (f(h + 1.0 / 3.0), f(h), f(h - 1.0 / 3.0))
}

pub fn hue_saturation(px: &mut [u8], hue: f64, saturation: f64, lightness: f64) {
    let sat = 1.0 + saturation / 100.0;
    let light = lightness / 100.0;
    each(px, |r, g, b| {
        let (h, s, l) = rgb_to_hsl(r, g, b);
        let l2 = if light >= 0.0 { l + (1.0 - l) * light } else { l * (1.0 + light) };
        hsl_to_rgb(h + hue, (s * sat).clamp(0.0, 1.0), l2)
    });
}

/// Raises the saturation of dull colours more than that of vivid ones.
pub fn vibrance(px: &mut [u8], amount: f64) {
    let a = amount / 100.0;
    each(px, |r, g, b| {
        let (h, s, l) = rgb_to_hsl(r, g, b);
        let boost = if a >= 0.0 { a * (1.0 - s) } else { a * s };
        hsl_to_rgb(h, (s + boost * s + if a >= 0.0 { boost * 0.5 } else { 0.0 }).clamp(0.0, 1.0), l)
    });
}

pub fn invert(px: &mut [u8]) {
    each(px, |r, g, b| (255.0 - r, 255.0 - g, 255.0 - b));
}

pub fn desaturate(px: &mut [u8]) {
    each(px, |r, g, b| {
        let y = luma(r, g, b);
        (y, y, y)
    });
}

/// Stretches each channel so the darkest and lightest 0.5% of pixels reach 0 and 255.
pub fn auto_levels(px: &mut [u8]) {
    let h = histogram(px);
    let luts: Vec<Vec<f64>> = [&h.r, &h.g, &h.b]
        .into_iter()
        .map(|bins| {
            let (low, high) = clip_points(bins, 0.005);
            let span = (high.saturating_sub(low)).max(1) as f64;
            (0..256).map(|i| (i as f64 - low as f64) * 255.0 / span).collect()
        })
        .collect();
    each(px, |r, g, b| (luts[0][r as usize], luts[1][g as usize], luts[2][b as usize]));
}

/// A normalised Gaussian kernel; its radius is the full width at roughly two sigma.
pub fn gaussian_kernel(radius: f64) -> Vec<f32> {
    let sigma = (radius / 2.0).max(0.1);
    let half = ((sigma * 3.0).ceil() as i32).max(1);
    let raw: Vec<f64> = (-half..=half).map(|i| (-f64::from(i * i) / (2.0 * sigma * sigma)).exp()).collect();
    let sum: f64 = raw.iter().sum();
    raw.into_iter().map(|v| (v / sum) as f32).collect()
}

fn pass(src: &[f32], dst: &mut [f32], w: usize, h: usize, k: &[f32], horizontal: bool) {
    let half = (k.len() / 2) as isize;
    for y in 0..h {
        for x in 0..w {
            let mut acc = [0f32; 4];
            for (t, wt) in (-half..=half).zip(k) {
                let (xx, yy) = if horizontal { ((x as isize + t).clamp(0, w as isize - 1) as usize, y) } else { (x, (y as isize + t).clamp(0, h as isize - 1) as usize) };
                let i = (yy * w + xx) * 4;
                for c in 0..4 {
                    acc[c] += src[i + c] * wt;
                }
            }
            let o = (y * w + x) * 4;
            dst[o..o + 4].copy_from_slice(&acc);
        }
    }
}

/// Gaussian blur with premultiplied alpha, so transparent edges do not bleed dark fringes.
pub fn gaussian_blur(px: &mut [u8], width: usize, height: usize, radius: f64) {
    if radius <= 0.0 || width == 0 || height == 0 || px.len() < width * height * 4 {
        return;
    }
    let mut a = vec![0f32; width * height * 4];
    for (o, p) in a.chunks_exact_mut(4).zip(px.chunks_exact(4)) {
        let al = f32::from(p[3]) / 255.0;
        o[0] = f32::from(p[0]) * al;
        o[1] = f32::from(p[1]) * al;
        o[2] = f32::from(p[2]) * al;
        o[3] = f32::from(p[3]);
    }
    let mut b = vec![0f32; a.len()];
    let k = gaussian_kernel(radius);
    pass(&a, &mut b, width, height, &k, true);
    pass(&b, &mut a, width, height, &k, false);
    for (p, o) in px.chunks_exact_mut(4).zip(a.chunks_exact(4)) {
        let al = o[3] / 255.0;
        for c in 0..3 {
            p[c] = if al > 0.0 { (o[c] / al).round().clamp(0.0, 255.0) as u8 } else { 0 };
        }
        p[3] = o[3].round().clamp(0.0, 255.0) as u8;
    }
}

/// Unsharp mask: adds back `amount` percent of the difference from a blurred copy.
pub fn unsharp_mask(px: &mut [u8], width: usize, height: usize, amount: f64, radius: f64) {
    let mut blurred = px.to_vec();
    gaussian_blur(&mut blurred, width, height, radius);
    let k = amount / 100.0;
    for (p, q) in px.chunks_exact_mut(4).zip(blurred.chunks_exact(4)) {
        for c in 0..3 {
            let v = f64::from(p[c]);
            p[c] = clamp8(v + (v - f64::from(q[c])) * k);
        }
    }
}

/// Applies the preview of engine command `command` with slider `values` to `px`, a `width` by
/// `height` frame. `scale` is frame pixels per document pixel, so radii match the engine's.
/// Returns `false` for a command with no preview.
/// Averages each `cell` x `cell` block into one flat colour (alpha-weighted).
pub fn mosaic(px: &mut [u8], width: usize, height: usize, cell: f64) {
    let cell = cell.round().max(1.0) as usize;
    if cell < 2 || px.len() < width * height * 4 {
        return;
    }
    for y0 in (0..height).step_by(cell) {
        for x0 in (0..width).step_by(cell) {
            let (y1, x1) = ((y0 + cell).min(height), (x0 + cell).min(width));
            let mut sum = [0f64; 4];
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = (y * width + x) * 4;
                    let a = f64::from(px[i + 3]);
                    for c in 0..3 {
                        sum[c] += f64::from(px[i + c]) * a;
                    }
                    sum[3] += a;
                }
            }
            let n = ((y1 - y0) * (x1 - x0)) as f64;
            let rgb = |c: usize| if sum[3] > 0.0 { clamp8(sum[c] / sum[3]) } else { 0 };
            let out = [rgb(0), rgb(1), rgb(2), clamp8(sum[3] / n)];
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = (y * width + x) * 4;
                    px[i..i + 4].copy_from_slice(&out);
                }
            }
        }
    }
}

/// Grey relief: the light difference across `height` pixels along `angle` (degrees), scaled by
/// `amount` percent, around mid-grey.
pub fn emboss(px: &mut [u8], width: usize, height: usize, angle: f64, depth: f64, amount: f64) {
    if px.len() < width * height * 4 || width == 0 || height == 0 {
        return;
    }
    let lum: Vec<f64> = px.chunks_exact(4).map(|p| luma(f64::from(p[0]), f64::from(p[1]), f64::from(p[2]))).collect();
    let (dx, dy) = (angle.to_radians().cos() * depth.max(1.0), -angle.to_radians().sin() * depth.max(1.0));
    let at = |x: usize, y: usize, sx: f64, sy: f64| {
        let xx = (x as f64 + sx).round().clamp(0.0, (width - 1) as f64) as usize;
        let yy = (y as f64 + sy).round().clamp(0.0, (height - 1) as f64) as usize;
        lum[yy * width + xx]
    };
    for y in 0..height {
        for x in 0..width {
            let v = clamp8(128.0 + (at(x, y, dx, dy) - at(x, y, -dx, -dy)) * amount / 100.0);
            let i = (y * width + x) * 4;
            px[i] = v;
            px[i + 1] = v;
            px[i + 2] = v;
        }
    }
}

/// Keeps only detail finer than `radius`: the pixel minus its blur, around mid-grey.
pub fn high_pass(px: &mut [u8], width: usize, height: usize, radius: f64) {
    let mut blurred = px.to_vec();
    gaussian_blur(&mut blurred, width, height, radius);
    for (p, b) in px.chunks_exact_mut(4).zip(blurred.chunks_exact(4)) {
        for c in 0..3 {
            p[c] = clamp8(128.0 + f64::from(p[c]) - f64::from(b[c]));
        }
    }
}

/// Levels on 0..255 values: input black/white points, midtone gamma, then the output range.
pub fn levels(px: &mut [u8], in_black: f64, in_white: f64, gamma: f64, out_black: f64, out_white: f64) {
    let span = (in_white - in_black).max(1.0);
    let gamma = if gamma.is_finite() && gamma > 0.0 { gamma } else { 1.0 };
    let lut: Vec<u8> = (0..256)
        .map(|v| {
            let t = ((f64::from(v) - in_black) / span).clamp(0.0, 1.0).powf(1.0 / gamma);
            clamp8(out_black + t * (out_white - out_black))
        })
        .collect();
    for p in px.chunks_exact_mut(4) {
        for c in &mut p[..3] {
            *c = lut[usize::from(*c)];
        }
    }
}

/// Black where the pixel's luma is below `level`, white from it up.
pub fn threshold(px: &mut [u8], level: f64) {
    for p in px.chunks_exact_mut(4) {
        let v = if luma(f64::from(p[0]), f64::from(p[1]), f64::from(p[2])) >= level { 255 } else { 0 };
        p[..3].fill(v);
    }
}

/// `levels` evenly spaced tones per channel (2 to 255).
pub fn posterize(px: &mut [u8], levels: f64) {
    let n = levels.round().clamp(2.0, 255.0);
    let step = 255.0 / (n - 1.0);
    for p in px.chunks_exact_mut(4) {
        for c in &mut p[..3] {
            *c = clamp8((f64::from(*c) / step).round() * step);
        }
    }
}

/// Uniform noise of `amount` percent, the same for every redraw of the same pixel (a hash, not a
/// random generator), so a slider drag doesn't shimmer.
pub fn add_noise(px: &mut [u8], width: usize, amount: f64) {
    let spread = amount.clamp(0.0, 400.0) / 100.0 * 255.0;
    for (i, p) in px.chunks_exact_mut(4).enumerate() {
        let (x, y) = (i % width.max(1), i / width.max(1));
        for (c, v) in p[..3].iter_mut().enumerate() {
            let mut hsh = (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA77) ^ (c as u32).wrapping_mul(0xC2B2_AE3D);
            hsh ^= hsh >> 15;
            hsh = hsh.wrapping_mul(0x2C1B_3C6D);
            hsh ^= hsh >> 12;
            let unit = f64::from(hsh & 0xFFFF) / 65535.0 - 0.5;
            *v = clamp8(f64::from(*v) + unit * spread);
        }
    }
}

/// Median of each channel over a (2r+1)-square window: removes specks, keeps edges. A running
/// histogram along each row keeps it at O(r) per pixel.
pub fn median(px: &mut [u8], width: usize, height: usize, radius: f64) {
    let r = radius.round().clamp(0.0, 64.0) as usize;
    if r == 0 || width == 0 || height == 0 || px.len() < width * height * 4 {
        return;
    }
    let src = px.to_vec();
    let window = |x0: usize, x1: usize, y: usize| (x0..=x1, y.saturating_sub(r)..=(y + r).min(height - 1));
    for c in 0..3 {
        for y in 0..height {
            let mut hist = [0u32; 256];
            let mut count = 0u32;
            let (xs, ys) = window(0, r.min(width - 1), y);
            for yy in ys.clone() {
                for xx in xs.clone() {
                    hist[usize::from(src[(yy * width + xx) * 4 + c])] += 1;
                    count += 1;
                }
            }
            for x in 0..width {
                if x > 0 {
                    if x > r {
                        for yy in ys.clone() {
                            hist[usize::from(src[(yy * width + x - r - 1) * 4 + c])] -= 1;
                            count -= 1;
                        }
                    }
                    if x + r < width {
                        for yy in ys.clone() {
                            hist[usize::from(src[(yy * width + x + r) * 4 + c])] += 1;
                            count += 1;
                        }
                    }
                }
                let half = count.div_ceil(2);
                let mut seen = 0;
                for (v, n) in hist.iter().enumerate() {
                    seen += n;
                    if seen >= half {
                        px[(y * width + x) * 4 + c] = v as u8;
                        break;
                    }
                }
            }
        }
    }
}

pub fn preview(command: &str, values: &Values, px: &mut [u8], width: usize, height: usize, scale: f64) -> bool {
    match command {
        "image.adjustments.brightnessContrast" => brightness_contrast(px, get(values, "brightness", 0.0), get(values, "contrast", 0.0)),
        "image.adjustments.exposure" => exposure_gamma(px, get(values, "exposure", 0.0), get(values, "gamma", 1.0)),
        "image.adjustments.hueSaturation" => hue_saturation(px, get(values, "hue", 0.0), get(values, "saturation", 0.0), get(values, "lightness", 0.0)),
        "image.adjustments.vibrance" => vibrance(px, get(values, "vibrance", 0.0)),
        "filter.blur.gaussianBlur" => gaussian_blur(px, width, height, get(values, "radius", 0.0) * scale),
        "filter.sharpen.unsharpMask" => unsharp_mask(px, width, height, get(values, "amount", 0.0), get(values, "radius", 1.0) * scale),
        "image.adjustments.levels" => levels(px, get(values, "inBlack", 0.0), get(values, "inWhite", 255.0), get(values, "gamma", 1.0), get(values, "outBlack", 0.0), get(values, "outWhite", 255.0)),
        "image.adjustments.threshold" => threshold(px, get(values, "level", 128.0)),
        "image.adjustments.posterize" => posterize(px, get(values, "levels", 4.0)),
        "filter.noise.addNoise" => add_noise(px, width, get(values, "amount", 12.5)),
        "filter.noise.median" => median(px, width, height, get(values, "radius", 1.0) * scale),
        "filter.pixelate.mosaic" => mosaic(px, width, height, get(values, "cellSize", 10.0) * scale),
        "filter.stylize.emboss" => emboss(px, width, height, get(values, "angle", 135.0), get(values, "height", 3.0) * scale, get(values, "amount", 100.0)),
        "filter.other.highPass" => high_pass(px, width, height, get(values, "radius", 10.0) * scale),
        "image.adjustments.invert" => invert(px),
        "image.adjustments.desaturate" => desaturate(px),
        "image.autoContrast" => auto_levels(px),
        _ => return false,
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: u8, b: u8, tol: u8) -> bool {
        a.abs_diff(b) <= tol
    }

    #[test]
    fn histogram_counts_and_skips_transparent() {
        let h = histogram(&[255, 0, 0, 255, 9, 9, 9, 0]);
        assert_eq!(h.count, 1);
        assert_eq!((h.r[255], h.g[0]), (1, 1));
        assert_eq!(h.flat().len(), 1024);
    }

    #[test]
    fn clip_points_trim_the_tails() {
        let mut bins = [0u32; 256];
        for b in bins.iter_mut().take(150).skip(50) {
            *b = 1;
        }
        let (low, high) = clip_points(&bins, 0.05);
        assert!((50..60).contains(&low) && (140..150).contains(&high), "{low} {high}");
        assert_eq!(clip_points(&[0; 256], 0.01), (0, 255));
    }

    #[test]
    fn invert_twice_is_identity_and_keeps_alpha() {
        let mut p = [10, 200, 30, 77];
        invert(&mut p);
        invert(&mut p);
        assert_eq!(p, [10, 200, 30, 77]);
    }

    #[test]
    fn neutral_settings_change_nothing() {
        let mut p = [100, 150, 200, 255];
        brightness_contrast(&mut p, 0.0, 0.0);
        exposure_gamma(&mut p, 0.0, 1.0);
        hue_saturation(&mut p, 0.0, 0.0, 0.0);
        for (got, want) in p.iter().zip([100u8, 150, 200, 255]) {
            assert!(close(*got, want, 2), "{p:?}");
        }
    }

    #[test]
    fn brightness_lifts_and_exposure_doubles_per_stop() {
        let mut p = [100, 100, 100, 255];
        brightness_contrast(&mut p, 50.0, 0.0);
        assert!(p[0] > 100);
        let mut q = [60, 60, 60, 255];
        exposure_gamma(&mut q, 1.0, 1.0);
        assert!(close(q[0], 120, 2));
    }

    #[test]
    fn desaturate_and_full_desaturation_give_grey() {
        let mut p = [255, 0, 0, 255];
        desaturate(&mut p);
        assert_eq!(p[0], p[1]);
        let mut q = [255, 0, 0, 255];
        hue_saturation(&mut q, 0.0, -100.0, 0.0);
        assert!(close(q[0], q[1], 1));
    }

    #[test]
    fn hsl_round_trips() {
        let (h, s, l) = rgb_to_hsl(200.0, 100.0, 50.0);
        let (r, g, b) = hsl_to_rgb(h, s, l);
        assert_eq!((r.round(), g.round(), b.round()), (200.0, 100.0, 50.0));
    }

    #[test]
    fn vibrance_favours_dull_colours() {
        let mut dull = [130, 120, 120, 255];
        let before = rgb_to_hsl(130.0, 120.0, 120.0).1;
        vibrance(&mut dull, 80.0);
        assert!(rgb_to_hsl(f64::from(dull[0]), f64::from(dull[1]), f64::from(dull[2])).1 > before);
        let mut vivid = [255, 0, 0, 255];
        vibrance(&mut vivid, 80.0);
        assert_eq!(vivid[0], 255);
    }

    #[test]
    fn auto_levels_stretches_a_flat_range() {
        let mut data: Vec<u8> = (0..50).flat_map(|i| [100 + i, 100 + i, 100 + i, 255]).collect();
        auto_levels(&mut data);
        let reds: Vec<u8> = data.chunks_exact(4).map(|p| p[0]).collect();
        assert!(reds.iter().min().copied().unwrap_or(255) < 10);
        assert!(reds.iter().max().copied().unwrap_or(0) > 245);
    }

    #[test]
    fn kernel_sums_to_one() {
        assert!((gaussian_kernel(3.0).iter().sum::<f32>() - 1.0).abs() < 1e-4);
    }

    #[test]
    fn blur_keeps_flat_flat_and_softens_an_edge() {
        let mut flat = [120u8, 120, 120, 255].repeat(16);
        gaussian_blur(&mut flat, 4, 4, 2.0);
        assert!(close(flat[0], 120, 1));
        let mut edge: Vec<u8> = (0..8).flat_map(|x| [if x < 4 { 0 } else { 255 }, 0, 0, 255]).collect();
        gaussian_blur(&mut edge, 8, 1, 2.0);
        assert!(edge[3 * 4] > 0 && edge[4 * 4] < 255);
    }

    #[test]
    fn blur_does_not_darken_transparent_edges() {
        let mut px: Vec<u8> = (0..8).flat_map(|x| if x < 4 { [200, 200, 200, 255] } else { [0, 0, 0, 0] }).collect();
        gaussian_blur(&mut px, 8, 1, 2.0);
        assert!(close(px[3 * 4], 200, 2), "colour stays put where there is coverage: {}", px[3 * 4]);
    }

    #[test]
    fn unsharp_adds_edge_contrast() {
        let mut edge: Vec<u8> = (0..8).flat_map(|x| [if x < 4 { 80 } else { 160 }, 80, 80, 255]).collect();
        unsharp_mask(&mut edge, 8, 1, 200.0, 1.0);
        assert!(edge[3 * 4] < 80 && edge[4 * 4] > 160);
    }

    #[test]
    fn preview_dispatches_by_command() {
        let mut p = [0, 0, 0, 255];
        assert!(preview("image.adjustments.invert", &Values::new(), &mut p, 1, 1, 1.0));
        assert_eq!(p[0], 255);
        assert!(!preview("file.new", &Values::new(), &mut p, 1, 1, 1.0));
    }

    #[test]
    fn mosaic_flattens_each_cell_to_its_average() {
        let mut px = vec![0, 0, 0, 255, 200, 200, 200, 255, 0, 0, 0, 255, 200, 200, 200, 255];
        mosaic(&mut px, 2, 2, 2.0);
        assert!(px.chunks_exact(4).all(|p| p == [100, 100, 100, 255]), "{px:?}");
    }

    #[test]
    fn emboss_is_flat_grey_on_flat_colour_and_marks_edges() {
        let mut flat = [50, 90, 200, 255].repeat(16);
        emboss(&mut flat, 4, 4, 135.0, 1.0, 100.0);
        assert!(flat.chunks_exact(4).all(|p| p[0] == 128 && p[1] == 128 && p[2] == 128));
        let mut edge: Vec<u8> = (0..16).flat_map(|i| if i % 4 < 2 { [0, 0, 0, 255] } else { [255, 255, 255, 255] }).collect();
        emboss(&mut edge, 4, 4, 0.0, 1.0, 100.0);
        assert_ne!(edge[4], 128);
    }

    #[test]
    fn high_pass_of_flat_colour_is_mid_grey() {
        let mut px = [30, 120, 220, 255].repeat(25);
        high_pass(&mut px, 5, 5, 2.0);
        assert!(px.chunks_exact(4).all(|p| p[..3].iter().all(|v| v.abs_diff(128) <= 1)));
    }

    #[test]
    fn preview_knows_the_new_filters() {
        let mut px = [10, 20, 30, 255].repeat(4);
        for id in ["filter.pixelate.mosaic", "filter.stylize.emboss", "filter.other.highPass", "image.adjustments.levels", "image.adjustments.threshold", "image.adjustments.posterize", "filter.noise.addNoise", "filter.noise.median"] {
            assert!(preview(id, &Values::new(), &mut px, 2, 2, 1.0), "{id}");
        }
    }

    #[test]
    fn levels_stretch_and_gamma() {
        let mut px = vec![64, 128, 192, 255];
        levels(&mut px, 64.0, 192.0, 1.0, 0.0, 255.0);
        assert_eq!(&px[..3], &[0, 128, 255]);
        let mut mid = vec![128, 128, 128, 255];
        levels(&mut mid, 0.0, 255.0, 2.0, 0.0, 255.0);
        assert!(mid[0] > 170, "{mid:?}");
        let mut out = vec![0, 255, 0, 255];
        levels(&mut out, 0.0, 255.0, 1.0, 20.0, 200.0);
        assert_eq!(&out[..2], &[20, 200]);
    }

    #[test]
    fn threshold_and_posterize() {
        let mut px = vec![10, 10, 10, 255, 240, 240, 240, 255];
        threshold(&mut px, 128.0);
        assert_eq!(px, vec![0, 0, 0, 255, 255, 255, 255, 255]);
        let mut p = vec![100, 30, 200, 255];
        posterize(&mut p, 2.0);
        assert_eq!(&p[..3], &[0, 0, 255]);
    }

    #[test]
    fn noise_is_stable_and_bounded() {
        let mut a = vec![128; 64];
        let mut b = vec![128; 64];
        add_noise(&mut a, 4, 50.0);
        add_noise(&mut b, 4, 50.0);
        assert_eq!(a, b);
        assert!(a.chunks_exact(4).any(|p| p[0] != 128));
        let mut none = vec![77; 16];
        add_noise(&mut none, 2, 0.0);
        assert!(none.iter().all(|v| *v == 77));
    }

    #[test]
    fn median_removes_a_speck_and_keeps_flat_areas() {
        let mut px = [50, 50, 50, 255].repeat(25);
        px[12 * 4] = 255;
        median(&mut px, 5, 5, 1.0);
        assert!(px.chunks_exact(4).all(|p| p[0] == 50), "{px:?}");
        let mut tiny = vec![9, 9, 9, 255];
        median(&mut tiny, 1, 1, 3.0);
        assert_eq!(tiny, vec![9, 9, 9, 255]);
    }
}
