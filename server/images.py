import io

from PIL import Image, UnidentifiedImageError

# Shared decoding for uploaded images (portraits and maps).

ACCEPTED_FORMATS = {'WEBP', 'PNG', 'JPEG'}
# Refuse to decode anything larger, so a tiny file can't unpack into a huge image.
MAX_SIDE = 4096

# Decodes an upload, raising error_type with a user-facing message if it is missing, too big or unreadable.
def decode_upload(data, max_bytes, error_type):
    if not data:
        raise error_type('No image was sent.')
    if len(data) > max_bytes:
        raise error_type(f'The image is too large (over {max_bytes // 1000} KB).')
    try:
        # Image.open reads only the header, so format and size are checked before decoding pixels.
        image = Image.open(io.BytesIO(data))
        if image.format not in ACCEPTED_FORMATS:
            raise error_type('Use a PNG, JPEG or WebP image.')
        if max(image.size) > MAX_SIDE:
            raise error_type(f'The image is too large (over {MAX_SIDE} pixels on a side).')
        image.load()
    except error_type:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise error_type('That file isn’t an image Quill can read.') from e
    return image

# Saves as WebP; omitting exif= means no metadata (such as GPS position) is written.
def encode_webp(image, quality):
    out = io.BytesIO()
    image.save(out, 'WEBP', quality=quality, method=4)
    return out.getvalue()
