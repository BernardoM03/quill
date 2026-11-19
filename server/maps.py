import io
import math

from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

# Campaign maps. An uploaded image is decoded and written out fresh, like a portrait
# (server/portraits.py), then read for its outline: the area a drawn coastline encloses is
# land. A hex grid laid over the image keeps the hexes that are mostly land, so the map's
# shape survives as hexes.

# The whole request must fit under the app's 1 MB body limit; the browser shrinks the image
# first (src/components/maps/makeMapImage.ts).
MAX_UPLOAD_BYTES = 950_000
# Refuse to decode anything larger, so a tiny file can't unpack into a huge image.
MAX_SIDE = 4096
# The stored image's longer side, at most.
STORED_SIDE = 2048
# Longer than this many times its width (or the other way round) and the grid would need
# more rows or columns than MAX_LINE at the default scale.
MAX_ASPECT = 4
ACCEPTED_FORMATS = {'WEBP', 'PNG', 'JPEG'}

# The land mask's longer side. Small, so finding the outline is quick and gaps in a drawn
# line close up; a hex is still many mask pixels across.
MASK_SIDE = 512
# A pixel is ink when it's this much darker than the paper (the image's median brightness).
INK_RATIO = 0.72
# Ink is grown by this many mask pixels (an odd filter size) so small gaps in the outline
# don't let the outside leak in.
CLOSE_GAPS = 5
# Below or above these shares of the image, the outline wasn't found (a painted map, a
# coastline with a wide gap): every hex is land and the GM removes the ones that aren't.
MIN_LAND_SHARE = 0.02
MAX_LAND_SHARE = 0.9

SQRT3 = math.sqrt(3)
# Grid limits: columns or rows, and hexes in all.
MAX_LINE = 150
MAX_HEXES = 10_000

UNITS = ('mi', 'km')
# What a new map starts with, per unit: hex size, then the width the image covers.
DEFAULT_SCALE = {'mi': (3, 90), 'km': (5, 150)}
MAX_HEX_SIZE = 100
MAX_MAP_WIDTH = 100_000

class MapImageError(Exception):
    pass

# The uploaded image, upright and no larger than STORED_SIDE, or MapImageError saying why not.
def read_image(data):
    if not data:
        raise MapImageError('No image was sent.')
    if len(data) > MAX_UPLOAD_BYTES:
        raise MapImageError(f'The image is too large (over {MAX_UPLOAD_BYTES // 1000} KB).')
    try:
        image = Image.open(io.BytesIO(data))  # reads the header only
        if image.format not in ACCEPTED_FORMATS:
            raise MapImageError('Use a PNG, JPEG or WebP image.')
        if max(image.size) > MAX_SIDE:
            raise MapImageError(f'The image is too large (over {MAX_SIDE} pixels on a side).')
        image.load()
    except MapImageError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise MapImageError('That file isn’t an image Quill can read.') from e

    image = ImageOps.exif_transpose(image).convert('RGB')
    if max(image.size) > MAX_ASPECT * min(image.size):
        raise MapImageError(f'Use an image no more than {MAX_ASPECT} times as long as it is wide.')
    if min(image.size) < 64:
        raise MapImageError('The image is too small (under 64 pixels on a side).')
    image.thumbnail((STORED_SIDE, STORED_SIDE), Image.Resampling.LANCZOS)
    return image

# The stored form of a map image: WebP with no metadata.
def encode_image(image):
    out = io.BytesIO()
    image.save(out, 'WEBP', quality=80, method=4)  # no exif= argument: metadata isn't written
    return out.getvalue()

# Marks every open pixel the image's border can reach as outside (1), in place. pixels is
# one byte per pixel: 0 open, anything else ink.
def _flood_outside(pixels, width, height):
    last_row = (height - 1) * width
    stack = list(range(width)) + [last_row + x for x in range(width)]
    stack += [y * width for y in range(height)] + [y * width + width - 1 for y in range(height)]
    while stack:
        i = stack.pop()
        if pixels[i]:
            continue
        pixels[i] = 1
        x = i % width
        if x:
            stack.append(i - 1)
        if x < width - 1:
            stack.append(i + 1)
        if i >= width:
            stack.append(i - width)
        if i < last_row:
            stack.append(i + width)

# Outside (1) becomes 0, everything else (open and enclosed, or ink) becomes land (255).
_TO_LAND = bytes(0 if value == 1 else 255 for value in range(256))

# The image's land as a small greyscale mask (255 land, 0 not): whatever its dark outline
# encloses. All land when no outline is found.
def land_mask(image):
    grey = image.convert('L')
    # The paper is the median brightness; ink is well darker than it. Graph-paper lines
    # and pencil shading are lighter than ink, so they don't count.
    histogram = grey.histogram()
    half, seen, paper = sum(histogram) / 2, 0, 255
    for paper, count in enumerate(histogram):
        seen += count
        if seen >= half:
            break
    cut = paper * INK_RATIO
    ink = grey.point(lambda value: 255 if value < cut else 0)

    scale = min(1, MASK_SIDE / max(grey.size))
    size = (max(1, round(grey.width * scale)), max(1, round(grey.height * scale)))
    # BOX averages each block, so a thin line still leaves a trace; any trace is ink.
    small = ink.resize(size, Image.Resampling.BOX).point(lambda value: 255 if value > 20 else 0)
    small = small.filter(ImageFilter.MaxFilter(CLOSE_GAPS))

    pixels = bytearray(small.tobytes())
    _flood_outside(pixels, *size)
    land = Image.frombytes('L', size, bytes(pixels.translate(_TO_LAND)))
    # Shrink then regrow: drops thin strokes (a title, a scale bar) and undoes the growth
    # the gap-closing gave the coast.
    land = land.filter(ImageFilter.MinFilter(CLOSE_GAPS + 2)).filter(ImageFilter.MaxFilter(CLOSE_GAPS))

    share = land.histogram()[255] / (size[0] * size[1])
    if not MIN_LAND_SHARE <= share <= MAX_LAND_SHARE:
        return Image.new('L', size, 255)
    return land

# The mask as stored: a 1-bit PNG, a few KB.
def encode_mask(mask):
    out = io.BytesIO()
    mask.convert('1').save(out, 'PNG', optimize=True)
    return out.getvalue()

def decode_mask(data):
    return Image.open(io.BytesIO(data)).convert('L')

# The hex grid over an image: flat-topped hexes in columns, odd columns half a hex lower.
# hex_size is the distance between the centres of neighbouring hexes (flat side to flat
# side) and map_width what the image's width covers, in the same unit. Returns the hex
# radius (centre to corner) in image pixels, then how many columns and rows cover the image.
def grid(image_width, image_height, hex_size, map_width):
    radius = hex_size / SQRT3 * image_width / map_width
    cols = math.ceil(image_width / (1.5 * radius))
    rows = math.ceil(image_height / (SQRT3 * radius))
    return radius, cols, rows

# Why a grid can't be used, or None. Kept in step with the setup page's own check.
def grid_problem(cols, rows):
    if cols < 2 or rows < 2:
        return 'That leaves fewer than two hexes across. Use smaller hexes or a wider map.'
    if cols > MAX_LINE or rows > MAX_LINE or cols * rows > MAX_HEXES:
        return 'That makes too many hexes. Use larger hexes or a narrower map.'
    return None

# A hex's centre in image pixels. The first hex sits just inside the top-left corner.
def centre(radius, col, row):
    return radius * (1 + 1.5 * col), radius * SQRT3 * (row + 0.5 + 0.5 * (col & 1))

# Where a hex is sampled, as offsets from its centre in radii: the centre, a ring of 6
# and a ring of 12.
_SAMPLES = [(0.0, 0.0)] + [
    (share * math.cos(math.radians(angle)), share * math.sin(math.radians(angle)))
    for share, step in ((0.45, 60), (0.8, 30)) for angle in range(15, 375, step)
]

# The hexes that are at least half land, as [col, row] pairs in column order.
def land_hexes(mask, image_width, radius, cols, rows):
    width, height = mask.size
    pixels = mask.tobytes()
    scale = width / image_width
    needed = len(_SAMPLES) / 2
    land = []
    for col in range(cols):
        for row in range(rows):
            cx, cy = centre(radius, col, row)
            hits = 0
            for dx, dy in _SAMPLES:
                x, y = int((cx + dx * radius) * scale), int((cy + dy * radius) * scale)
                if 0 <= x < width and 0 <= y < height and pixels[y * width + x]:
                    hits += 1
            if hits >= needed:
                land.append([col, row])
    return land
