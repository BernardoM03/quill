import base64
import json

from flask import Blueprint, jsonify

from server.access import require_admin
from server.db import connection
from server.helpers import error
from server.routes.account import SNAPSHOT_DAYS

bp = Blueprint('admin', __name__, url_prefix='/admin')

# Matches snapshots still inside their restore window, whether or not the purge has run yet.
NOT_EXPIRED = "deleted_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
RESTORE_WINDOW = (f'-{SNAPSHOT_DAYS} days',)

# Deleted accounts the admin can still restore, newest first.
@bp.get('/deleted-accounts')
@require_admin
def list_deleted_accounts():
    with connection() as conn:
        rows = conn.execute(
            'SELECT id, username, snapshot, deleted_at, '
            f"CAST(ceil({SNAPSHOT_DAYS} - (julianday('now') - julianday(deleted_at))) AS INTEGER) AS days_left "
            f'FROM deleted_accounts WHERE {NOT_EXPIRED} ORDER BY deleted_at DESC',
            RESTORE_WINDOW,
        ).fetchall()
    accounts = []
    for row in rows:
        snapshot = json.loads(row['snapshot'])
        accounts.append({
            'id': row['id'],
            'username': row['username'],
            'displayName': snapshot['user']['display_name'],
            'deletedAt': row['deleted_at'],
            'daysLeft': max(1, row['days_left']),
            'campaigns': [membership['campaign_name'] for membership in snapshot['memberships']],
            'characterCount': len(snapshot['characters']),
        })
    return jsonify(accounts), 200

def _restore_character(conn, user_id, character):
    conn.execute(
        'INSERT INTO characters (id, campaign_id, owner_id, name, sheet, personal_notes, is_active, '
        'created_at, updated_at, deleted_at, status, review_reason, disguise) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (character['id'], character['campaign_id'], user_id, character['name'], json.dumps(character['sheet']),
         character['personal_notes'], character['is_active'], character['created_at'], character['updated_at'],
         character['deleted_at'],
         # Snapshots older than character approval have no status, and those characters were all playable.
         character.get('status', 'approved'), character.get('review_reason'),
         # Snapshots older than party visibility have no disguise.
         character.get('disguise')),
    )
    # Snapshots older than portraits have no 'portrait' key.
    if character.get('portrait'):
        conn.execute(
            'INSERT INTO character_portraits (character_id, image) VALUES (?, ?)',
            (character['id'], base64.b64decode(character['portrait'])),
        )

# Restores the user, their memberships and their characters with notes.
# Anything in a campaign deleted since is skipped and reported in the response.
@bp.post('/deleted-accounts/<account_id>/restore')
@require_admin
def restore_account(account_id):
    with connection() as conn:
        with conn:
            row = conn.execute(
                f'SELECT snapshot FROM deleted_accounts WHERE id = ? AND {NOT_EXPIRED}', (account_id, *RESTORE_WINDOW)
            ).fetchone()
            if row is None:
                return error('Deleted account not found. It may be past its 30 days.', 404)
            snapshot = json.loads(row['snapshot'])
            user = snapshot['user']

            conflicting = conn.execute(
                'SELECT username FROM users WHERE username = ? OR id = ?', (user['username'], user['id'])
            ).fetchone()
            if conflicting:
                return error(f'The username "{conflicting["username"]}" has been taken since this account was deleted. '
                             'It can’t be restored while that account exists.', 409)

            conn.execute(
                'INSERT INTO users (id, username, display_name, password_hash, is_admin, created_at) '
                'VALUES (?, ?, ?, ?, 0, ?)',
                (user['id'], user['username'], user['display_name'], user['password_hash'], user['created_at']),
            )
            existing_campaigns = {row['id'] for row in conn.execute('SELECT id FROM campaigns')}
            skipped_campaigns = sorted({
                membership['campaign_name'] for membership in snapshot['memberships']
                if membership['campaign_id'] not in existing_campaigns
            })
            for membership in snapshot['memberships']:
                if membership['campaign_id'] in existing_campaigns:
                    conn.execute(
                        'INSERT INTO memberships (campaign_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
                        (membership['campaign_id'], user['id'], membership['role'], membership['joined_at']),
                    )
            restored_count = 0
            for character in snapshot['characters']:
                # Sandbox characters have no campaign, so they always come back.
                campaign_id = character['campaign_id']
                if campaign_id is not None and campaign_id not in existing_campaigns:
                    continue
                _restore_character(conn, user['id'], character)
                restored_count += 1
            conn.execute('DELETE FROM deleted_accounts WHERE id = ?', (account_id,))
    return jsonify({
        'username': user['username'],
        'restoredCharacters': restored_count,
        'skippedCharacters': len(snapshot['characters']) - restored_count,
        'skippedCampaigns': skipped_campaigns,
    }), 200
