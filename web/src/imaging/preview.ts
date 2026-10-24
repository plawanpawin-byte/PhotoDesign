// Maps an Adjust-tab card to the in-browser preview of the same operation.
import { autoLevels, brightnessContrast, desaturate, exposureGamma, hueSaturation, invert, vibrance, type Pixels } from './adjust';
import { gaussianBlur, unsharpMask } from './convolve';

/** `scale` is frame pixels per document pixel, so radii match what the engine will do. */
export type PreviewFn = (px: Pixels, width: number, height: number, scale: number) => void;

/** The preview for an engine command and its slider values, or `null` when there is none. */
export function previewFor(command: string, v: Record<string, number>): PreviewFn | null {
  switch (command) {
    case 'image.adjustments.brightnessContrast': return (px) => brightnessContrast(px, v.brightness ?? 0, v.contrast ?? 0);
    case 'image.adjustments.exposure': return (px) => exposureGamma(px, v.exposure ?? 0, v.gamma ?? 1);
    case 'image.adjustments.hueSaturation': return (px) => hueSaturation(px, v.hue ?? 0, v.saturation ?? 0, v.lightness ?? 0);
    case 'image.adjustments.vibrance': return (px) => vibrance(px, v.vibrance ?? 0);
    case 'filter.blur.gaussianBlur': return (px, w, h, s) => gaussianBlur(px, w, h, (v.radius ?? 0) * s);
    case 'filter.sharpen.unsharpMask': return (px, w, h, s) => unsharpMask(px, w, h, v.amount ?? 0, (v.radius ?? 1) * s);
    case 'image.adjustments.invert': return (px) => invert(px);
    case 'image.adjustments.desaturate': return (px) => desaturate(px);
    case 'image.autoContrast': return (px) => autoLevels(px);
    default: return null;
  }
}
