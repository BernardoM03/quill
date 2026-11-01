// Turns a picked image into a small square portrait before it's uploaded: a square part of
// the image (the crop), scaled to 256x256, as WebP (PNG where the browser can't make WebP).
// A phone photo of several MB becomes ~10-30 KB, so the upload is quick. The server
// re-encodes it anyway (server/portraits.py); this just keeps the upload small.

export const PORTRAIT_SIZE = 256;

// A square in the image's own pixels: its top-left corner and side length.
export interface squareCrop {
  x: number,
  y: number,
  size: number,
}

// Reads the file into an image, upright: phone cameras store rotation separately.
export async function loadImage(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That file isn’t an image this browser can read.');
  }
}

// The largest centred square: what the cropper starts with.
export function centreCrop(image: ImageBitmap): squareCrop {
  const size = Math.min(image.width, image.height);
  return { x: (image.width - size) / 2, y: (image.height - size) / 2, size };
}

export async function renderPortrait(image: ImageBitmap, crop: squareCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare images.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error('Couldn’t prepare the image.');
  return blob;
}
