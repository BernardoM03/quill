from flask import Blueprint, jsonify

from server.access import public, require_login
from server.helpers import error
from server.rules import packs

bp = Blueprint('packs', __name__, url_prefix='/packs')

# Pack data barely changes, so browsers may reuse it for a few minutes. "private" keeps
# shared caches (proxies) from storing what's behind a sign-in.
CACHE = 'private, max-age=300'

# Every installed pack's manifest. Public: the legal page shows each pack's license and
# attribution to everyone, signed in or not, as the licenses require.
@bp.get('')
@public
def get_manifests():
    response = jsonify(packs.load_manifests())
    response.headers['Cache-Control'] = 'public, max-age=300'
    return response

# One collection ("spells", "classes", ...) merged across all installed packs, in pack order.
@bp.get('/collections/<name>')
@require_login
def get_collection(name):
    if name not in packs.collection_names():
        return error('No installed pack provides that collection.', 404)
    response = jsonify(list(packs.collection(name).values()))
    response.headers['Cache-Control'] = CACHE
    return response
