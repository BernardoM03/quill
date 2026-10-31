import hashlib
import secrets
import uuid

from flask import Blueprint, jsonify, request

from server.db import connect
from server.helpers import NOW, current_user, error, is_gm, json_body, session_user
from server.ratelimit import limit

INVITE_DEFAULT_DAYS = 7
INVITE_MAX_DAYS = 365
INVITE_MAX_USES = 1000

INVITE_COLUMNS = f'id, max_uses, use_count, expires_at, revoked_at, created_at, expires_at <= {NOW} AS expired'

bp = Blueprint('invites', __name__)

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()

# Uses up one use of the invite and returns its campaign id, or None if it isn't active.
# A single statement, so two people racing for the last use can't both get it.
# Call inside a transaction, so a later failure gives the use back.
def claim_invite(conn, token):
    row = conn.execute(
        'UPDATE invites SET use_count = use_count + 1 WHERE token_hash = ? AND revoked_at IS NULL '
        f'AND (expires_at IS NULL OR expires_at > {NOW}) AND (max_uses IS NULL OR use_count < max_uses) '
        'RETURNING campaign_id',
        (hash_token(token),),
    ).fetchone()
    return row['campaign_id'] if row else None

def invite_status(row):
    if row['revoked_at']:
        return 'revoked'
    if row['expired']:
        return 'expired'
    if row['max_uses'] is not None and row['use_count'] >= row['max_uses']:
        return 'used'
    return 'active'

def invite_json(row):
    return {
        'id': row['id'],
        'status': invite_status(row),
        'maxUses': row['max_uses'],
        'useCount': row['use_count'],
        'expiresAt': row['expires_at'],
        'createdAt': row['created_at'],
    }

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

# Public: anyone holding the link can check it before joining
@bp.get('/invites/<token>')
@limit('invite-check', 30, 10 * 60)
def check_invite(token):
    conn = connect()
    try:
        row = conn.execute(
            'SELECT i.max_uses, i.use_count, i.revoked_at, '
            f'i.expires_at <= {NOW} AS expired, c.name AS campaign_name FROM invites i '
            'JOIN campaigns c ON c.id = i.campaign_id WHERE i.token_hash = ?',
            (hash_token(token),),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return error('Invite not found', 404)
    status = invite_status(row)
    return jsonify({'campaignName': row['campaign_name'], 'valid': status == 'active', 'status': status}), 200

# Joins the signed-in player to the invite's campaign. Needs a real session, not the
# admin fallback. Someone already in the campaign is let through without using up the invite.
@bp.post('/invites/<token>/accept')
@limit('invite-accept', 10, 60 * 60)
def accept_invite(token):
    conn = connect()
    try:
        with conn:
            user = session_user(conn)
            if user is None:
                return error('Sign in first.', 401)
            row = conn.execute(
                'SELECT m.campaign_id FROM invites i JOIN memberships m '
                'ON m.campaign_id = i.campaign_id AND m.user_id = ? WHERE i.token_hash = ?',
                (user['id'], hash_token(token)),
            ).fetchone()
            if row:
                return jsonify({'campaignId': row['campaign_id']}), 200
            campaign_id = claim_invite(conn, token)
            if campaign_id is None:
                return error('This invite is not valid.', 400)
            conn.execute(
                "INSERT INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'player')",
                (campaign_id, user['id']),
            )
    finally:
        conn.close()
    return jsonify({'campaignId': campaign_id}), 201

# Revokes an invite.
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
