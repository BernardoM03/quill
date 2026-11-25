from flask import Blueprint, jsonify

from server.access import require_login
from server.rules.settings import LIMITS, RULE_DEFAULTS

bp = Blueprint('rules', __name__)

# The Character Sandbox uses these defaults, and campaigns fall back to them for unchanged rules.
@bp.get('/rules')
@require_login
def get_rules():
    return jsonify({'defaults': RULE_DEFAULTS, 'limits': LIMITS}), 200
