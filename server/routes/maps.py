import json
import uuid

from flask import Blueprint, Response, jsonify, request

from server import maps
from server.access import require_member
from server.db import connect
from server.helpers import NAME_MAX_LENGTH, NOW, clean_name, current_user, error, is_gm, json_body, revalidated_json
from server.ratelimit import limit
from server.records import record_problems
from server.rules import packs

bp = Blueprint('maps', __name__)

# The kinds a map can be made as. The table also allows 'battle' and 'world', for later.
KINDS = ('hex',)
MAX_MAPS = 50

# A hex nobody has changed. One saved back to this has its row removed.
EMPTY_HEX = {'status': 'hidden', 'name': '', 'description': '', 'notes': '', 'encounters': [], 'randomEncounters': []}

# Every route here is for the campaign's members. The GM (or the admin) sees and changes
# everything. A player sees only public, finalized maps, and of those only what
# player_view lets through; anything else answers 404, as if it didn't exist.

def _find(conn, campaign_id, map_id):
    return conn.execute('SELECT * FROM campaign_maps WHERE id = ? AND campaign_id = ?', (map_id, campaign_id)).fetchone()

def _visible_to_players(row):
    return row['visibility'] == 'public' and row['status'] == 'ready'

def _summary(row):
    return {
        'id': row['id'], 'name': row['name'], 'kind': row['kind'], 'visibility': row['visibility'],
        'status': row['status'], 'updatedAt': row['updated_at'],
    }

# The map's hexes that have a row and are still part of the map, keyed by (col, row).
def _hexes(conn, row, land):
    rows = conn.execute('SELECT hex_col, hex_row, data FROM campaign_map_hexes WHERE map_id = ?', (row['id'],)).fetchall()
    return {(r['hex_col'], r['hex_row']): json.loads(r['data']) for r in rows if (r['hex_col'], r['hex_row']) in land}

def _map_json(conn, row, gm):
    radius, cols, rows = maps.grid(row['image_width'], row['image_height'], row['hex_size'], row['map_width'])
    land = [tuple(hex) for hex in json.loads(row['land'])]
    hexes = _hexes(conn, row, set(land))
    data = _summary(row)
    data.update({
        'unit': row['unit'], 'hexSize': row['hex_size'], 'mapWidth': row['map_width'],
        'grid': {'cols': cols, 'rows': rows},
        'canEdit': gm,
    })
    if gm:
        data.update({
            'showOutline': bool(row['show_outline']),
            # In hex radii, the unit the page draws in. GM only, like the image itself.
            'image': {'width': row['image_width'] / radius, 'height': row['image_height'] / radius},
            'land': land,
            'hexes': [{'col': col, 'row': hex_row, **hex} for (col, hex_row), hex in hexes.items()],
        })
    else:
        data.update(player_view(land, hexes, bool(row['show_outline'])))
    return data

# What a player is sent of a map's hexes: the name and description of scouted and visited
# hexes, and nothing else about them. Hidden hexes are bare positions, and only when the
# GM shows the outline; otherwise they're left out and the map grows as it's explored.
def player_view(land, hexes, show_outline):
    seen = {key: hex for key, hex in hexes.items() if hex['status'] != 'hidden'}
    return {
        'land': land if show_outline else [key for key in land if key in seen],
        'hexes': [
            {'col': col, 'row': row, 'status': hex['status'], 'name': hex['name'], 'description': hex['description']}
            for (col, row), hex in seen.items()
        ],
    }

@bp.get('/campaigns/<campaign_id>/maps')
@require_member
def list_maps(campaign_id):
    conn = connect()
    try:
        gm = is_gm(conn, campaign_id, current_user(conn))
        rows = conn.execute(
            'SELECT * FROM campaign_maps WHERE campaign_id = ? ORDER BY created_at', (campaign_id,)
        ).fetchall()
    finally:
        conn.close()
    return jsonify([_summary(row) for row in rows if gm or _visible_to_players(row)]), 200

# Body: a form with name, kind and image (PNG, JPEG or WebP). The image is re-encoded and
# read for its outline; the map starts as a private draft at the default scale.
@bp.post('/campaigns/<campaign_id>/maps')
@require_member
@limit('map-upload', 20, 60 * 60)
def create_map(campaign_id):
    name = clean_name(request.form.get('name'))
    if name is None:
        return error(f'Name must be 1–{NAME_MAX_LENGTH} characters.', 400)
    if request.form.get('kind') not in KINDS:
        return error('Only hex maps can be made for now.', 400)
    upload = request.files.get('image')
    conn = connect()
    try:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        count = conn.execute('SELECT COUNT(*) FROM campaign_maps WHERE campaign_id = ?', (campaign_id,)).fetchone()[0]
        if count >= MAX_MAPS:
            return error(f'A campaign can have at most {MAX_MAPS} maps.', 409)
        try:
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
                (map_id, campaign_id, name, request.form['kind'], unit, hex_size, map_width, image.width, image.height, json.dumps(land)),
            )
            conn.execute(
                'INSERT INTO campaign_map_images (map_id, image, mask) VALUES (?, ?, ?)',
                (map_id, maps.encode_image(image), maps.encode_mask(mask)),
            )
    finally:
        conn.close()
    return jsonify({'id': map_id}), 201

@bp.get('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def get_map(campaign_id, map_id):
    conn = connect()
    try:
        gm = is_gm(conn, campaign_id, current_user(conn))
        row = _find(conn, campaign_id, map_id)
        if row is None or not (gm or _visible_to_players(row)):
            return error('Map not found', 404)
        # ?view=player: the GM's preview of what players are sent, made the same way.
        data = _map_json(conn, row, gm and request.args.get('view') != 'player')
    finally:
        conn.close()
    # The page asks again every so often; unchanged, this is an empty 304.
    return revalidated_json(data)

# The uploaded image, for the GM only: it shows the whole map, explored or not.
@bp.get('/campaigns/<campaign_id>/maps/<map_id>/image')
@require_member
def get_map_image(campaign_id, map_id):
    conn = connect()
    try:
        image = is_gm(conn, campaign_id, current_user(conn)) and _find(conn, campaign_id, map_id) and conn.execute(
            'SELECT image FROM campaign_map_images WHERE map_id = ?', (map_id,)
        ).fetchone()
    finally:
        conn.close()
    if not image:
        return error('Map not found', 404)
    response = Response(image['image'], mimetype='image/webp')
    # A map's image never changes after upload.
    response.headers['Cache-Control'] = 'private, max-age=86400'
    return response

def _whole(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high

# A list of [col, row] pairs inside the grid, as a set of tuples; None if it isn't one.
def _hex_list(value, cols, rows):
    if not isinstance(value, list) or len(value) > maps.MAX_HEXES:
        return None
    hexes = set()
    for hex in value:
        if not (isinstance(hex, list) and len(hex) == 2 and _whole(hex[0], 0, cols - 1) and _whole(hex[1], 0, rows - 1)):
            return None
        hexes.add((hex[0], hex[1]))
    return hexes

# Body: any of
#   name, visibility ('private' | 'public'), showOutline
#   unit, hexSize, mapWidth: the scale. Draft only; the land is worked out again from the image.
#   land: {add: [[col, row], ...], remove: [...]}: hexes to put on or take off the map.
#   status: 'ready': finalize. There's no going back to a draft.
# All are checked before any is saved. Returns the map as it now is.
@bp.patch('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def update_map(campaign_id, map_id):
    content = json_body()
    if content is None:
        return error('Body must be a JSON object.', 400)
    conn = connect()
    try:
        with conn:
            row = _find(conn, campaign_id, map_id)
            if row is None or not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)

            name = row['name']
            if 'name' in content:
                name = clean_name(content['name'])
                if name is None:
                    return error(f'Name must be 1–{NAME_MAX_LENGTH} characters.', 400)
            visibility = content.get('visibility', row['visibility'])
            if visibility not in ('private', 'public'):
                return error('visibility must be private or public.', 400)
            show_outline = content.get('showOutline', bool(row['show_outline']))
            if not isinstance(show_outline, bool):
                return error('showOutline must be true or false.', 400)

            unit, hex_size, map_width = row['unit'], row['hex_size'], row['map_width']
            land = [tuple(hex) for hex in json.loads(row['land'])]
            rescaled = any(key in content for key in ('unit', 'hexSize', 'mapWidth'))
            if rescaled:
                if row['status'] != 'draft':
                    return error('The scale can’t change once the map is finalized.', 409)
                unit = content.get('unit', unit)
                hex_size = content.get('hexSize', hex_size)
                map_width = content.get('mapWidth', map_width)
                if unit not in maps.UNITS:
                    return error('unit must be mi or km.', 400)
                if not _whole(hex_size, 1, maps.MAX_HEX_SIZE):
                    return error(f'Hex size must be a whole number from 1 to {maps.MAX_HEX_SIZE}.', 400)
                if not _whole(map_width, 1, maps.MAX_MAP_WIDTH):
                    return error(f'Map width must be a whole number from 1 to {maps.MAX_MAP_WIDTH}.', 400)
            radius, cols, rows = maps.grid(row['image_width'], row['image_height'], hex_size, map_width)
            if rescaled:
                problem = maps.grid_problem(cols, rows)
                if problem:
                    return error(problem, 400)
                mask = conn.execute('SELECT mask FROM campaign_map_images WHERE map_id = ?', (map_id,)).fetchone()['mask']
                land = [tuple(hex) for hex in maps.land_hexes(maps.decode_mask(mask), row['image_width'], radius, cols, rows)]

            if 'land' in content:
                change = content['land'] if isinstance(content['land'], dict) else {}
                add = _hex_list(change.get('add', []), cols, rows)
                remove = _hex_list(change.get('remove', []), cols, rows)
                if add is None or remove is None:
                    return error('land must be {add, remove}: lists of [col, row] inside the grid.', 400)
                # A removed hex keeps its row; it's only left out, and comes back if re-added.
                land = sorted((set(land) | add) - remove)

            status = content.get('status', row['status'])
            if status != row['status']:
                if status != 'ready':
                    return error('A finalized map can’t go back to a draft.', 400)
                if not land:
                    return error('The map has no hexes. Add some before finalizing.', 400)

            conn.execute(
                'UPDATE campaign_maps SET name = ?, visibility = ?, show_outline = ?, unit = ?, hex_size = ?, map_width = ?, '
                f'land = ?, status = ?, updated_at = {NOW} WHERE id = ?',
                (name, visibility, int(show_outline), unit, hex_size, map_width, json.dumps(land), status, map_id),
            )
            data = _map_json(conn, _find(conn, campaign_id, map_id), True)
    finally:
        conn.close()
    return jsonify(data), 200

@bp.delete('/campaigns/<campaign_id>/maps/<map_id>')
@require_member
def delete_map(campaign_id, map_id):
    conn = connect()
    try:
        with conn:
            if not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)
            # Its image and hexes go with it (ON DELETE CASCADE).
            deleted = conn.execute(
                'DELETE FROM campaign_maps WHERE id = ? AND campaign_id = ?', (map_id, campaign_id)
            ).rowcount
    finally:
        conn.close()
    if not deleted:
        return error('Map not found', 404)
    return jsonify({'success': True}), 200

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
    creatures = packs.collection('creatures') if 'creatures' in packs.collection_names() else {}
    for encounter in content['encounters'] + content['randomEncounters']:
        for entry in encounter['creatures']:
            if entry['creature'] not in creatures:
                return error(f'No installed pack has the creature {entry["creature"]}.', 400)

    conn = connect()
    try:
        with conn:
            row = _find(conn, campaign_id, map_id)
            if row is None or not is_gm(conn, campaign_id, current_user(conn)):
                return error('Map not found', 404)
            if row['status'] != 'ready':
                return error('Finalize the map before editing its hexes.', 409)
            if [col, hex_row] not in json.loads(row['land']):
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
    finally:
        conn.close()
    return jsonify({'col': col, 'row': hex_row, **content}), 200
