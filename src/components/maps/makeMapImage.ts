// Shrinks a picked map image before it's uploaded, as makePortrait does for portraits. The
// server takes at most 1 MB a request and re-encodes whatever arrives (server/maps.py), so
// this only has to get the image under that: smaller and more compressed until it fits.
import { loadImage } from '../portrait/makePortrait';

// Just under the server's own limit (MAX_UPLOAD_BYTES), leaving room for the form around it.
const MAX_BYTES = 900_000;
// Longest side and WebP quality, tried in order until one fits.
const ATTEMPTS: [number, number][] = [[2048, 0.85], [2048, 0.7], [1600, 0.7], [1280, 0.6], [1024, 0.5]];

function render(image: ImageBitmap, side: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, side / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare images.');
  // A see-through image would turn black as it's flattened; put paper behind it.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
}

// The file as an image small enough to upload. Rejects with a message for the user.
export async function prepareMapImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  try {
    for (const [side, quality] of ATTEMPTS) {
      const blob = await render(image, side, quality);
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
  } finally {
    image.close();
  }
  throw new Error('Couldn’t make that image small enough to upload. Try a smaller one.');
}
