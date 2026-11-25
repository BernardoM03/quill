import json
import uuid

from flask import Blueprint, Response, jsonify, request

from server import maps
from server.access import require_member
from server.db import connection
from server.helpers import NAME_MAX_LENGTH, NOW, clean_name, current_user, error, is_gm, json_body, revalidated_json
from server.ratelimit import limit
from server.records import record_problems
from server.rules import packs

bp = Blueprint('maps', __name__)

# Kinds that can be created now; the table also allows 'battle' and 'world' for later.
KINDS = ('hex',)
MAX_MAPS = 50
SCALE_FIELDS = ('unit', 'hexSize', 'mapWidth')

# A hex saved back to this untouched state has its row removed.
EMPTY_HEX = {'status': 'hidden', 'name': '', 'description': '', 'notes': '', 'encounters': [], 'randomEncounters': []}

# The GM (or admin) sees and changes everything.
# Players see only public, finalized maps through player_view, and get 404 for anything else.

class MapRequestError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def _find(conn, campaign_id, map_id):
    return conn.execute('SELECT * FROM campaign_maps WHERE id = ? AND campaign_id = ?', (map_id, campaign_id)).fetchone()

def _visible_to_players(map_row):
    return map_row['visibility'] == 'public' and map_row['status'] == 'ready'

def _parse_land(map_row):
    return [tuple(cell) for cell in json.loads(map_row['land'])]

def _summary(map_row):
    return {
        'id': map_row['id'], 'name': map_row['name'], 'kind': map_row['kind'], 'visibility': map_row['visibility'],
        'status': map_row['status'], 'updatedAt': map_row['updated_at'],
    }

# Saved hex records that are still part of the map, keyed by (col, row).
def _saved_hexes(conn, map_id, land):
    rows = conn.execute('SELECT hex_col, hex_row, data FROM campaign_map_hexes WHERE map_id = ?', (map_id,)).fetchall()
    return {
        (row['hex_col'], row['hex_row']): json.loads(row['data'])
        for row in rows if (row['hex_col'], row['hex_row']) in land
    }

def _map_json(conn, map_row, as_gm):
    radius, cols, rows = maps.grid(map_row['image_width'], map_row['image_height'], map_row['hex_size'], map_row['map_width'])
    land = _parse_land(map_row)
    hexes = _saved_hexes(conn, map_row['id'], set(land))
    show_outline = bool(map_row['show_outline'])
    data = _summary(map_row)
    data.update({
        'unit': map_row['unit'], 'hexSize': map_row['hex_size'], 'mapWidth': map_row['map_width'],
        'grid': {'cols': cols, 'rows': rows},
        'canEdit': as_gm,
    })
    if as_gm:
        data.update({
            'showOutline': show_outline,
            # Measured in hex radii, the unit the page draws in.
            'image': {'width': map_row['image_width'] / radius, 'height': map_row['image_height'] / radius},
            'land': land,
            'hexes': [{'col': col, 'row': row, **hex_data} for (col, row), hex_data in hexes.items()],
        })
    else:
        data.update(player_view(land, hexes, show_outline))
    return data

# Players get only the name and description of scouted and visited hexes.
# Hidden hexes appear as bare positions when the GM shows the outline, so otherwise the map grows as it's explored.
def player_view(land, hexes, show_outline):
    revealed = {position: hex_data for position, hex_data in hexes.items() if hex_data['status'] != 'hidden'}
    return {
        'land': land if show_outline else [position for position in land if position in revealed],
        'hexes': [
            {'col': col, 'row': row, 'status': hex_data['status'], 'name': hex_data['name'], 'description': hex_data['description']}
            for (col, row), hex_data in revealed.items()
        ],
    }

@bp.get('/campaigns/<campaign_id>/maps')
@require_member
def list_maps(campaign_id):
    with connection() as conn:
        as_gm = is_gm(conn, campaign_id, current_user(conn))
        rows = conn.execute(
            'SELECT * FROM campaign_maps WHERE campaign_id = ? ORDER BY created_at', (campaign_id,)
        ).fetchall()
    return jsonify([_summary(row) for row in rows if as_gm or _visible_to_players(row)]), 200

# Form fields: name, kind and image (PNG, JPEG or WebP).
# The map starts as a private draft at the default scale, with land read from the image's outline.
@bp.post('/campaigns/<campaign_id>/maps')
@require_member
@limit('map-upload', 20, 60 * 60)
def create_map(campaign_id):
    name = clean_name(request.form.get('name'))
    if name is None:
        return error(f'Name must be 1–{NAME_MAX_LENGTH} characters.', 400)
    kind = request.form.get('kind')
    if kind not in KINDS:
        return error('Only hex maps can be made for now.', 400)
    upload = request.files.get('image')
    with connection() as conn:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        map_count = conn.execute('SELECT COUNT(*) FROM campaign_maps WHERE campaign_id = ?', (campaign_id,)).fetchone()[0]
        if map_count >= MAX_MAPS:
            return error(f'A campaign can have at most {MAX_MAPS} maps.', 409)
        try:
            # Reading one byte past the limit is enough to detect an oversized upload.
            image = maps.read_image(upload.read(maps.MAX_UPLOAD_BYTES + 1) if upload else b'')
        except maps.MapImageError as e:
            return error(str(e), 400)
        mask = maps.land_mask(image)
        unit = 'mi'
        hex_size, map_width = maps.DEFAULT_SCALE[unit]
        radius, cols, rows = maps.grid(image.width, image.height, hex_size, map_width)
        land = maps.land_hexes(mask, image.width, radius, cols, rows)
        map_id = str(uuid.uuid4())
        with conn:
            conn.execute(
                'INSERT INTO campaign_maps (id, campaign_id, name, kind, unit, hex_size, map_width, image_width, image_height, land) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (map_id, campaign_id, name, kind, unit, hex_size, map_width, image.width, image.height, json.dumps(land)),
            )
            conn.execute(
                'INSERT INTO campaign_map_images (map_id, image, mask) VALUES (?, ?, ?)',
                (map_id, maps.encode_image(image), maps.encode_mask(mask)),
            )
    return jsonify({'id': map_id}), 201

@bp.get('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def get_map(campaign_id, map_id):
    with connection() as conn:
        as_gm = is_gm(conn, campaign_id, current_user(conn))
        map_row = _find(conn, campaign_id, map_id)
        if map_row is None or not (as_gm or _visible_to_players(map_row)):
            return error('Map not found', 404)
        # ?view=player lets the GM preview exactly what players are sent.
        data = _map_json(conn, map_row, as_gm and request.args.get('view') != 'player')
    # The page polls this, so an unchanged map is answered with an empty 304.
    return revalidated_json(data)

# GM only, since the image shows the whole map whether explored or not.
@bp.get('/campaigns/<campaign_id>/maps/<map_id>/image')
@require_member
def get_map_image(campaign_id, map_id):
    with connection() as conn:
        image_row = None
        if is_gm(conn, campaign_id, current_user(conn)) and _find(conn, campaign_id, map_id):
            image_row = conn.execute('SELECT image FROM campaign_map_images WHERE map_id = ?', (map_id,)).fetchone()
    if not image_row:
        return error('Map not found', 404)
    response = Response(image_row['image'], mimetype='image/webp')
    # A map's image never changes after upload.
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response

def _is_whole_in_range(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high

# A set of (col, row) tuples from a list of [col, row] pairs inside the grid, or None if invalid.
def _parse_hex_list(value, cols, rows):
    if not isinstance(value, list) or len(value) > maps.MAX_HEXES:
        return None
    positions = set()
    for pair in value:
        if not (isinstance(pair, list) and len(pair) == 2
                and _is_whole_in_range(pair[0], 0, cols - 1) and _is_whole_in_range(pair[1], 0, rows - 1)):
            return None
        positions.add((pair[0], pair[1]))
    return positions

# The validated (unit, hex_size, map_width) after applying any scale fields in content.
def _requested_scale(content, map_row):
    unit = content.get('unit', map_row['unit'])
    hex_size = content.get('hexSize', map_row['hex_size'])
    map_width = content.get('mapWidth', map_row['map_width'])
    if unit not in maps.UNITS:
        raise MapRequestError('unit must be mi or km.')
    if not _is_whole_in_range(hex_size, 1, maps.MAX_HEX_SIZE):
        raise MapRequestError(f'Hex size must be a whole number from 1 to {maps.MAX_HEX_SIZE}.')
    if not _is_whole_in_range(map_width, 1, maps.MAX_MAP_WIDTH):
        raise MapRequestError(f'Map width must be a whole number from 1 to {maps.MAX_MAP_WIDTH}.')
    return unit, hex_size, map_width

# Validates a map PATCH body against the stored row and returns the column values to save.
def _map_changes(conn, content, map_row):
    name = map_row['name']
    if 'name' in content:
        name = clean_name(content['name'])
        if name is None:
            raise MapRequestError(f'Name must be 1–{NAME_MAX_LENGTH} characters.')
    visibility = content.get('visibility', map_row['visibility'])
    if visibility not in ('private', 'public'):
        raise MapRequestError('visibility must be private or public.')
    show_outline = content.get('showOutline', bool(map_row['show_outline']))
    if not isinstance(show_outline, bool):
        raise MapRequestError('showOutline must be true or false.')

    land = _parse_land(map_row)
    rescaled = any(field in content for field in SCALE_FIELDS)
    if rescaled:
        if map_row['status'] != 'draft':
            raise MapRequestError('The scale can’t change once the map is finalized.', 409)
        unit, hex_size, map_width = _requested_scale(content, map_row)
    else:
        unit, hex_size, map_width = map_row['unit'], map_row['hex_size'], map_row['map_width']
    radius, cols, rows = maps.grid(map_row['image_width'], map_row['image_height'], hex_size, map_width)
    if rescaled:
        problem = maps.grid_problem(cols, rows)
        if problem:
            raise MapRequestError(problem)
        # A new scale means a new grid, so land is recomputed from the stored mask.
        mask = conn.execute('SELECT mask FROM campaign_map_images WHERE map_id = ?', (map_row['id'],)).fetchone()['mask']
        land = [tuple(cell) for cell in maps.land_hexes(maps.decode_mask(mask), map_row['image_width'], radius, cols, rows)]

    if 'land' in content:
        land_change = content['land'] if isinstance(content['land'], dict) else {}
        added = _parse_hex_list(land_change.get('add', []), cols, rows)
        removed = _parse_hex_list(land_change.get('remove', []), cols, rows)
        if added is None or removed is None:
            raise MapRequestError('land must be {add, remove}: lists of [col, row] inside the grid.')
        # A removed hex keeps its saved record, which returns if the hex is re-added.
        land = sorted((set(land) | added) - removed)

    status = content.get('status', map_row['status'])
    if status != map_row['status']:
        if status != 'ready':
            raise MapRequestError('A finalized map can’t go back to a draft.')
        if not land:
            raise MapRequestError('The map has no hexes. Add some before finalizing.')

    return name, visibility, int(show_outline), unit, hex_size, map_width, json.dumps(land), status

# Body: any of name, visibility, showOutline, the scale (unit, hexSize, mapWidth; drafts only),
# land {add, remove} and status 'ready' to finalize for good.
# All fields are checked before any is saved, and the updated map is returned.
@bp.patch('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def update_map(campaign_id, map_id):
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    with connection() as conn:
        with conn:
            map_row = _find(conn, campaign_id, map_id)
            if map_row is None or not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)
            try:
                changes = _map_changes(conn, content, map_row)
            except MapRequestError as e:
                return error(str(e), e.status)
            conn.execute(
                'UPDATE campaign_maps SET name = ?, visibility = ?, show_outline = ?, unit = ?, hex_size = ?, map_width = ?, '
                f'land = ?, status = ?, updated_at = {NOW} WHERE id = ?',
                (*changes, map_id),
            )
            data = _map_json(conn, _find(conn, campaign_id, map_id), True)
    return jsonify(data), 200

@bp.delete('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def delete_map(campaign_id, map_id):
    with connection() as conn:
        with conn:
            if not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)
            # The image and hexes go with it through ON DELETE CASCADE.
            deleted_count = conn.execute(
                'DELETE FROM campaign_maps WHERE id = ? AND campaign_id = ?', (map_id, campaign_id)
            ).rowcount
    if not deleted_count:
        return error('Map not found', 404)
    return jsonify({'success': True}), 200

def _unknown_creature(hex_record):
    creatures = packs.collection('creatures') if 'creatures' in packs.collection_names() else {}
    for encounter in hex_record['encounters'] + hex_record['randomEncounters']:
        for entry in encounter['creatures']:
            if entry['creature'] not in creatures:
                return entry['creature']
    return None

# Body: the whole hex record (schemas/records/hex.schema.json), replacing what was there.
@bp.put('/campaigns/<campaign_id>/maps/<map_id>/hexes/<int:col>/<int:hex_row>')
@require_member
def put_hex(campaign_id, map_id, col, hex_row):
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    problems = record_problems('hex', content)
    if problems:
        return error(problems[0], 400)
    content['name'] = ' '.join(content['name'].split())
    unknown_creature = _unknown_creature(content)
    if unknown_creature:
        return error(f'No installed pack has the creature {unknown_creature}.', 400)

    with connection() as conn:
        with conn:
            map_row = _find(conn, campaign_id, map_id)
            if map_row is None or not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)
            if map_row['status'] != 'ready':
                return error('Finalize the map before editing its hexes.', 409)
            if [col, hex_row] not in json.loads(map_row['land']):
                return error('That hex isn’t part of the map.', 404)
            if content == EMPTY_HEX:
                conn.execute(
                    'DELETE FROM campaign_map_hexes WHERE map_id = ? AND hex_col = ? AND hex_row = ?', (map_id, col, hex_row)
                )
            else:
                conn.execute(
                    'INSERT INTO campaign_map_hexes (map_id, hex_col, hex_row, data) VALUES (?, ?, ?, ?) '
                    f'ON CONFLICT (map_id, hex_col, hex_row) DO UPDATE SET data = excluded.data, updated_at = {NOW}',
                    (map_id, col, hex_row, json.dumps(content)),
                )
            conn.execute(f'UPDATE campaign_maps SET updated_at = {NOW} WHERE id = ?', (map_id,))
    return jsonify({'col': col, 'row': hex_row, **content}), 200
