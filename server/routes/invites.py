import hashlib
import secrets
import uuid

from flask import Blueprint, jsonify, request

from server.db import connect
from server.helpers import NOW, current_user, error, is_gm, json_body

INVITE_DEFAULT_DAYS = 7
INVITE_MAX_DAYS = 365
INVITE_MAX_USES = 1000

INVITE_COLUMNS = f'id, max_uses, use_count, expires_at, revoked_at, created_at, expires_at <= {NOW} AS expired'

bp = Blueprint('invites', __name__)

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()

def invite_json(row):
    if row['revoked_at']:
        status = 'revoked'
    elif row['expired']:
        status = 'expired'
    elif row['max_uses'] is not None and row['use_count'] >= row['max_uses']:
        status = 'used'
    else:
        status = 'active'
    return {
        'id': row['id'],
        'status': status,
        'maxUses': row['max_uses'],
        'useCount': row['use_count'],
        'expiresAt': row['expires_at'],
        'createdAt': row['created_at'],
    }

# Newest first, including revoked and expired ones. Raw tokens are never stored, so they can't be listed.
@bp.get('/campaigns/<campaign_id>/invites')
def get_invites(campaign_id):
    conn = connect()
    try:
        if not is_gm(conn, campaign_id, current_user(conn)):
            return error('Campaign not found', 404)
        rows = conn.execute(
            f'SELECT {INVITE_COLUMNS} FROM invites WHERE campaign_id = ? ORDER BY created_at DESC',
            (campaign_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify([invite_json(r) for r in rows]), 200

# Body (optional): {expiresInDays: 1–365 or null for never, maxUses: 1–1000 or null for unlimited}.
# The response is the only time the raw token is shown.
@bp.post('/campaigns/<campaign_id>/invites')
def create_invite(campaign_id):
    content = json_body() if request.content_length else {}
    if content is None:
        return error('Body must be a JSON object.', 400)
    unknown = set(content) - {'expiresInDays', 'maxUses'}
    if unknown:
        return error(f'Unknown field: {sorted(unknown)[0]}', 400)
    days = content.get('expiresInDays', INVITE_DEFAULT_DAYS)
    max_uses = content.get('maxUses')
    def valid_count(v, top): return v is None or (isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= top)
    if not valid_count(days, INVITE_MAX_DAYS):
        return error(f'expiresInDays must be 1–{INVITE_MAX_DAYS} or null.', 400)
    if not valid_count(max_uses, INVITE_MAX_USES):
        return error(f'maxUses must be 1–{INVITE_MAX_USES} or null.', 400)

    token = secrets.token_urlsafe(32)
    invite_id = str(uuid.uuid4())
    conn = connect()
    try:
        with conn:
            user = current_user(conn)
            if not is_gm(conn, campaign_id, user):
                return error('Campaign not found', 404)
            conn.execute(
                'INSERT INTO invites (id, campaign_id, created_by, token_hash, max_uses, expires_at) VALUES '
                "(?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ? || ' days') END)",
                (invite_id, campaign_id, user['id'], hash_token(token), max_uses, days, days),
            )
            row = conn.execute(f'SELECT {INVITE_COLUMNS} FROM invites WHERE id = ?', (invite_id,)).fetchone()
    finally:
        conn.close()
    return jsonify({**invite_json(row), 'token': token}), 201

# Revokes an invite. Takes the raw token from the link, or the invite id from the list
# (for a GM who no longer has the link). The row stays, marked revoked.
@bp.delete('/invites/<token>')
def revoke_invite(token):
    conn = connect()
    try:
        with conn:
            row = conn.execute(
                'SELECT id, campaign_id FROM invites WHERE token_hash = ? OR id = ?', (hash_token(token), token)
            ).fetchone()
            if row is None or not is_gm(conn, row['campaign_id'], current_user(conn)):
                return error('Invite not found', 404)
            conn.execute(f'UPDATE invites SET revoked_at = COALESCE(revoked_at, {NOW}) WHERE id = ?', (row['id'],))
    finally:
        conn.close()
    return jsonify({'success': True}), 200
