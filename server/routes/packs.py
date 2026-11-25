from flask import Blueprint, jsonify

from server.access import public, require_login
from server.helpers import error
from server.rules import packs

bp = Blueprint('packs', __name__, url_prefix='/packs')

# Pack data barely changes, so browsers may reuse it for five minutes.
# "private" keeps shared proxies from storing what sits behind a sign-in.
PRIVATE_CACHE = 'private, max-age=300'
PUBLIC_CACHE = 'public, max-age=300'

# Public because the legal page must show every pack's license and attribution to everyone.
@bp.get('')
@public
def get_manifests():
    response = jsonify(packs.load_manifests())
    response.headers['Cache-Control'] = PUBLIC_CACHE
    return response

# One collection ("spells", "classes", ...) merged across all installed packs in pack order.
@bp.get('/collections/<name>')
@require_login
def get_collection(name):
    if name not in packs.collection_names():
        return error('No installed pack provides that collection.', 404)
    response = jsonify(list(packs.collection(name).values()))
    response.headers['Cache-Control'] = PRIVATE_CACHE
    return response
