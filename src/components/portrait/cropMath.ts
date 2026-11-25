// The cropper's arithmetic, kept separate from the dialog so it can be tested alone.
import type { SquareCrop } from './makePortrait';

type ImageSize = { width: number; height: number };

// At full zoom the frame shows 1/MAX_ZOOM of the image's shorter side.
export const MAX_ZOOM = 6;

// Clamps a crop so it stays inside the image.
export function clamp(image: ImageSize, crop: SquareCrop): SquareCrop {
  const size = Math.min(crop.size, image.width, image.height);
  return {
    size,
    x: Math.min(Math.max(crop.x, 0), image.width - size),
    y: Math.min(Math.max(crop.y, 0), image.height - size),
  };
}

// Zooms by factor (above 1 zooms in) while keeping the frame point (fx, fy) fixed on screen.
// fx and fy run from 0 to 1 and default to the centre.
export function zoomBy(image: ImageSize, crop: SquareCrop, factor: number, fx = 0.5, fy = 0.5): SquareCrop {
  const full = Math.min(image.width, image.height);
  const size = Math.min(full, Math.max(full / MAX_ZOOM, crop.size / factor));
  return clamp(image, {
    size,
    x: crop.x + (crop.size - size) * fx,
    y: crop.y + (crop.size - size) * fy,
  });
}
