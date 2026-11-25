from PIL import Image, ImageOps

from server.images import decode_upload, encode_webp

# The browser crops portraits already, but every upload is re-encoded so no metadata survives.

SIZE = 256
MAX_UPLOAD_BYTES = 200_000

class PortraitError(Exception):
    pass

# The stored form of an uploaded image: an upright, centre-cropped 256x256 WebP.
def normalise(data):
    image = decode_upload(data, MAX_UPLOAD_BYTES, PortraitError)
    # Phone photos store their rotation separately in EXIF.
    image = ImageOps.exif_transpose(image)
    image = ImageOps.fit(image.convert('RGBA'), (SIZE, SIZE), Image.Resampling.LANCZOS)
    return encode_webp(image, quality=85)
