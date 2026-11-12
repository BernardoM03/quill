// The cropper's arithmetic, kept apart from the dialog so it can be checked on its own.
import type { squareCrop } from './makePortrait';

// Only the image's dimensions matter here.
type imageSize = { width: number; height: number };

// At most this far in: the frame then shows 1/MAX_ZOOM of the image's shorter side.
export const MAX_ZOOM = 6;

// Clamps a crop so it stays inside the image.
export function clamp(image: imageSize, crop: squareCrop): squareCrop {
  const size = Math.min(crop.size, image.width, image.height);
  return {
    size,
    x: Math.min(Math.max(crop.x, 0), image.width - size),
    y: Math.min(Math.max(crop.y, 0), image.height - size),
  };
}

// The crop zoomed by factor (>1 is in), keeping the point at (fx, fy) of the frame
// (0-1, default the centre) where it is on screen.
export function zoomBy(image: imageSize, crop: squareCrop, factor: number, fx = 0.5, fy = 0.5): squareCrop {
  const full = Math.min(image.width, image.height);
  const size = Math.min(full, Math.max(full / MAX_ZOOM, crop.size / factor));
  return clamp(image, {
    size,
    x: crop.x + (crop.size - size) * fx,
    y: crop.y + (crop.size - size) * fy,
  });
}
