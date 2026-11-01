// Turns a picked image file into a small square portrait before it's uploaded: the centre
// square of the image, scaled to 256x256, as WebP (PNG where the browser can't make WebP).
// A phone photo of several MB becomes ~10-30 KB, so the upload is quick. The server
// re-encodes it anyway (server/portraits.py); this just keeps the upload small.

export const PORTRAIT_SIZE = 256;

export async function makePortrait(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');

  let bitmap: ImageBitmap;
  try {
    // Applies the rotation phone cameras store separately from the pixels.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That file isn’t an image this browser can read.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare images.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error('Couldn’t prepare the image.');
  return blob;
}
