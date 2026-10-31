from flask import Blueprint, jsonify

from server.access import require_login
from server.rules.settings import LIMITS, RULE_DEFAULTS

bp = Blueprint('rules', __name__)

# The default rules and their limits: what the Character Sandbox uses, and what a
# campaign falls back to for any rule its GM hasn't changed.
@bp.get('/rules')
@require_login
def get_rules():
    return jsonify({'defaults': RULE_DEFAULTS, 'limits': LIMITS}), 200
