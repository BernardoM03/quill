import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Character portraits. The browser already crops and shrinks them, but anyone can call the
# API, so every upload is decoded and written out fresh here: a 256x256 WebP with no
# metadata (photos can carry the GPS position they were taken at).

SIZE = 256
MAX_UPLOAD_BYTES = 200_000
# Refuse to decode anything larger, so a tiny file can't unpack into a huge image.
MAX_SIDE = 4096
ACCEPTED_FORMATS = {'WEBP', 'PNG', 'JPEG'}

class PortraitError(Exception):
    pass

# Returns the stored form of an uploaded image, or raises PortraitError saying why not.
def normalise(data):
    if not data:
        raise PortraitError('No image was sent.')
    if len(data) > MAX_UPLOAD_BYTES:
        raise PortraitError(f'The image is too large (over {MAX_UPLOAD_BYTES // 1000} KB).')
    try:
        image = Image.open(io.BytesIO(data))  # reads the header only
        if image.format not in ACCEPTED_FORMATS:
            raise PortraitError('Use a PNG, JPEG or WebP image.')
        if max(image.size) > MAX_SIDE:
            raise PortraitError(f'The image is too large (over {MAX_SIDE} pixels on a side).')
        image.load()
    except PortraitError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise PortraitError('That file isn’t an image Quill can read.') from e

    # Upright (phone photos store rotation separately), centre square, 256x256.
    image = ImageOps.exif_transpose(image)
    image = ImageOps.fit(image.convert('RGBA'), (SIZE, SIZE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, 'WEBP', quality=85, method=4)  # no exif= argument: metadata isn't written
    return out.getvalue()
