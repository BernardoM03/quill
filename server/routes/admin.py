import json

from flask import Blueprint, jsonify

from server.access import require_admin
from server.db import connect
from server.helpers import error
from server.routes.account import SNAPSHOT_DAYS

bp = Blueprint('admin', __name__, url_prefix='/admin')

# Snapshots still inside the 30 days, whether or not the cleanup has run yet.
NOT_EXPIRED = "deleted_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
WINDOW = (f'-{SNAPSHOT_DAYS} days',)

# Deleted accounts the admin can still restore, newest first.
@bp.get('/deleted-accounts')
@require_admin
def list_deleted_accounts():
    conn = connect()
    try:
        rows = conn.execute(
            'SELECT id, username, snapshot, deleted_at, '
            f"CAST(ceil({SNAPSHOT_DAYS} - (julianday('now') - julianday(deleted_at))) AS INTEGER) AS days_left "
            f'FROM deleted_accounts WHERE {NOT_EXPIRED} ORDER BY deleted_at DESC',
            WINDOW,
        ).fetchall()
    finally:
        conn.close()
    accounts = []
    for row in rows:
        snapshot = json.loads(row['snapshot'])
        accounts.append({
            'id': row['id'],
            'username': row['username'],
            'displayName': snapshot['user']['display_name'],
            'deletedAt': row['deleted_at'],
            'daysLeft': max(1, row['days_left']),
            'campaigns': [m['campaign_name'] for m in snapshot['memberships']],
            'characterCount': len(snapshot['characters']),
        })
    return jsonify(accounts), 200

# Brings back the user, their memberships, and their characters with notes. Memberships
# and characters in campaigns deleted since are skipped and listed in the response.
@bp.post('/deleted-accounts/<account_id>/restore')
@require_admin
def restore_account(account_id):
    conn = connect()
    try:
        with conn:
            row = conn.execute(
                f'SELECT snapshot FROM deleted_accounts WHERE id = ? AND {NOT_EXPIRED}', (account_id, *WINDOW)
            ).fetchone()
            if row is None:
                return error('Deleted account not found. It may be past its 30 days.', 404)
            snapshot = json.loads(row['snapshot'])
            user = snapshot['user']

            taken = conn.execute(
                'SELECT username FROM users WHERE username = ? OR id = ?', (user['username'], user['id'])
            ).fetchone()
            if taken:
                return error(f'The username "{taken["username"]}" has been taken since this account was deleted. '
                             'It can’t be restored while that account exists.', 409)

            conn.execute(
                'INSERT INTO users (id, username, display_name, password_hash, is_admin, created_at) '
                'VALUES (?, ?, ?, ?, 0, ?)',
                (user['id'], user['username'], user['display_name'], user['password_hash'], user['created_at']),
            )
            existing = {r['id'] for r in conn.execute('SELECT id FROM campaigns')}
            skipped = sorted({m['campaign_name'] for m in snapshot['memberships'] if m['campaign_id'] not in existing})
            for m in snapshot['memberships']:
                if m['campaign_id'] in existing:
                    conn.execute(
                        'INSERT INTO memberships (campaign_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
                        (m['campaign_id'], user['id'], m['role'], m['joined_at']),
                    )
            restored_characters = 0
            for c in snapshot['characters']:
                # Sandbox characters (no campaign) always come back.
                if c['campaign_id'] is not None and c['campaign_id'] not in existing:
                    continue
                conn.execute(
                    'INSERT INTO characters (id, campaign_id, owner_id, name, sheet, personal_notes, is_active, '
                    'created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (c['id'], c['campaign_id'], user['id'], c['name'], json.dumps(c['sheet']), c['personal_notes'],
                     c['is_active'], c['created_at'], c['updated_at'], c['deleted_at']),
                )
                restored_characters += 1
            conn.execute('DELETE FROM deleted_accounts WHERE id = ?', (account_id,))
    finally:
        conn.close()
    return jsonify({
        'username': user['username'],
        'restoredCharacters': restored_characters,
        'skippedCharacters': len(snapshot['characters']) - restored_characters,
        'skippedCampaigns': skipped,
    }), 200
