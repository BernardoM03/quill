import io
import math

from PIL import Image, ImageFilter, ImageOps

from server.images import decode_upload, encode_webp

# Campaign map images, plus the hex grid derived from the land their drawn coastline encloses.

# The browser shrinks the image first so the request fits under the app's 1 MB body limit.
MAX_UPLOAD_BYTES = 950_000
STORED_SIDE = 2048
MIN_SIDE = 64
# A longer aspect ratio would need more than MAX_LINE rows or columns at the default scale.
MAX_ASPECT = 4

# The land mask is small so outline detection is fast and gaps in drawn lines close up.
MASK_SIDE = 512
# A pixel is ink when it is darker than this share of the paper's (median) brightness.
INK_RATIO = 0.72
# A BOX-shrunk mask pixel brighter than this held some ink.
INK_TRACE_THRESHOLD = 20
# Ink grows by this odd filter size so small gaps in the outline don't let the outside leak in.
CLOSE_GAPS = 5
# A land share outside these bounds means no outline was found, so every hex counts as land.
MIN_LAND_SHARE = 0.02
MAX_LAND_SHARE = 0.9

SQRT3 = math.sqrt(3)
# Grid limits on columns or rows, and on hexes in total.
MAX_LINE = 150
MAX_HEXES = 10_000

UNITS = ('mi', 'km')
# A new map's (hex size, map width) per unit.
DEFAULT_SCALE = {'mi': (3, 90), 'km': (5, 150)}
MAX_HEX_SIZE = 100
MAX_MAP_WIDTH = 100_000

OUTSIDE = 1
LAND = 255

class MapImageError(Exception):
    pass

# The uploaded image, upright and no larger than STORED_SIDE.
def read_image(data):
    image = decode_upload(data, MAX_UPLOAD_BYTES, MapImageError)
    image = ImageOps.exif_transpose(image).convert('RGB')
    if max(image.size) > MAX_ASPECT * min(image.size):
        raise MapImageError(f'Use an image no more than {MAX_ASPECT} times as long as it is wide.')
    if min(image.size) < MIN_SIDE:
        raise MapImageError(f'The image is too small (under {MIN_SIDE} pixels on a side).')
    image.thumbnail((STORED_SIDE, STORED_SIDE), Image.Resampling.LANCZOS)
    return image

def encode_image(image):
    return encode_webp(image, quality=80)

# Marks every open pixel (0) reachable from the border as OUTSIDE, in place.
def _flood_outside(pixels, width, height):
    last_row_start = (height - 1) * width
    stack = [x for x in range(width)] + [last_row_start + x for x in range(width)]
    stack += [y * width for y in range(height)] + [y * width + width - 1 for y in range(height)]
    while stack:
        i = stack.pop()
        if pixels[i]:
            continue
        pixels[i] = OUTSIDE
        x = i % width
        if x > 0:
            stack.append(i - 1)
        if x < width - 1:
            stack.append(i + 1)
        if i >= width:
            stack.append(i - width)
        if i < last_row_start:
            stack.append(i + width)

# Byte translation table: OUTSIDE becomes 0 and everything else (enclosed or ink) becomes LAND.
_OUTSIDE_TO_LAND = bytes(0 if value == OUTSIDE else LAND for value in range(256))

def _median_brightness(grey):
    histogram = grey.histogram()
    half = sum(histogram) / 2
    seen = 0
    for brightness, count in enumerate(histogram):
        seen += count
        if seen >= half:
            return brightness
    return 255

# A small greyscale mask of the land (255) the image's dark outline encloses, or all land if none is found.
def land_mask(image):
    grey = image.convert('L')
    # Graph-paper lines and pencil shading are lighter than ink, so they fall above the cut.
    ink_cutoff = _median_brightness(grey) * INK_RATIO
    ink = grey.point(lambda value: 255 if value < ink_cutoff else 0)

    scale = min(1, MASK_SIDE / max(grey.size))
    size = (max(1, round(grey.width * scale)), max(1, round(grey.height * scale)))
    # BOX averages each block, so even a thin line leaves a trace that counts as ink.
    small = ink.resize(size, Image.Resampling.BOX).point(lambda value: 255 if value > INK_TRACE_THRESHOLD else 0)
    small = small.filter(ImageFilter.MaxFilter(CLOSE_GAPS))

    pixels = bytearray(small.tobytes())
    _flood_outside(pixels, *size)
    land = Image.frombytes('L', size, bytes(pixels.translate(_OUTSIDE_TO_LAND)))
    # Eroding then dilating drops thin strokes (titles, scale bars) and undoes the gap-closing growth.
    land = land.filter(ImageFilter.MinFilter(CLOSE_GAPS + 2)).filter(ImageFilter.MaxFilter(CLOSE_GAPS))

    land_share = land.histogram()[LAND] / (size[0] * size[1])
    if not MIN_LAND_SHARE <= land_share <= MAX_LAND_SHARE:
        return Image.new('L', size, LAND)
    return land

# Stored as a 1-bit PNG of a few KB.
def encode_mask(mask):
    out = io.BytesIO()
    mask.convert('1').save(out, 'PNG', optimize=True)
    return out.getvalue()

def decode_mask(data):
    return Image.open(io.BytesIO(data)).convert('L')

# Flat-topped hexes in columns, with odd columns shifted half a hex down.
# hex_size is the flat-to-flat distance and map_width the image width, both in map units.
# Returns the hex radius (centre to corner) in image pixels, then the column and row counts.
def grid(image_width, image_height, hex_size, map_width):
    radius = hex_size / SQRT3 * image_width / map_width
    cols = math.ceil(image_width / (1.5 * radius))
    rows = math.ceil(image_height / (SQRT3 * radius))
    return radius, cols, rows

# Why a grid can't be used, or None; mirrors the setup page's own check.
def grid_problem(cols, rows):
    if cols < 2 or rows < 2:
        return 'That leaves fewer than two hexes across. Use smaller hexes or a wider map.'
    if cols > MAX_LINE or rows > MAX_LINE or cols * rows > MAX_HEXES:
        return 'That makes too many hexes. Use larger hexes or a narrower map.'
    return None

# A hex's centre in image pixels, with the first hex just inside the top-left corner.
def centre(radius, col, row):
    return radius * (1 + 1.5 * col), radius * SQRT3 * (row + 0.5 + 0.5 * (col & 1))

# Sample points as offsets from a hex centre in radii: the centre, a ring of 6 and a ring of 12.
_SAMPLE_OFFSETS = [(0.0, 0.0)] + [
    (distance * math.cos(math.radians(angle)), distance * math.sin(math.radians(angle)))
    for distance, step in ((0.45, 60), (0.8, 30)) for angle in range(15, 375, step)
]

# The hexes that are at least half land, as [col, row] pairs in column order.
def land_hexes(mask, image_width, radius, cols, rows):
    mask_width, mask_height = mask.size
    pixels = mask.tobytes()
    scale = mask_width / image_width
    samples_needed = len(_SAMPLE_OFFSETS) / 2
    land = []
    for col in range(cols):
        for row in range(rows):
            cx, cy = centre(radius, col, row)
            land_samples = 0
            for dx, dy in _SAMPLE_OFFSETS:
                x, y = int((cx + dx * radius) * scale), int((cy + dy * radius) * scale)
                if 0 <= x < mask_width and 0 <= y < mask_height and pixels[y * mask_width + x]:
                    land_samples += 1
            if land_samples >= samples_needed:
                land.append([col, row])
    return land
