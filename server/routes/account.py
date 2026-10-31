import json
from datetime import datetime, timezone

from flask import Blueprint, Response, g, jsonify, session

from server.access import require_login
from server.db import connect
from server.helpers import current_user, error, json_body
from server.ratelimit import limit

# The phrase a player types to erase everything with no snapshot.
ERASE_PHRASE = 'All data completely removed'
SNAPSHOT_DAYS = 30

bp = Blueprint('account', __name__)

# Everything stored about a user. include_secrets adds the password hash, which the
# admin needs to restore the account but which never goes into the player's download.
def collect_account(conn, user_id, include_secrets):
    user = dict(conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    if not include_secrets:
        user.pop('password_hash', None)
    memberships = [dict(r) for r in conn.execute(
        'SELECT m.campaign_id, c.name AS campaign_name, m.role, m.joined_at '
        'FROM memberships m JOIN campaigns c ON c.id = m.campaign_id WHERE m.user_id = ? ORDER BY m.joined_at',
        (user_id,),
    )]
    characters = []
    for row in conn.execute('SELECT * FROM characters WHERE owner_id = ? ORDER BY created_at', (user_id,)):
        character = dict(row)
        character['sheet'] = json.loads(character['sheet'])
        characters.append(character)
    return {'user': user, 'memberships': memberships, 'characters': characters}

# Snapshots older than 30 days can no longer be restored, so they're removed. Runs at startup.
def purge_old_snapshots():
    conn = connect()
    try:
        with conn:
            conn.execute(
                "DELETE FROM deleted_accounts WHERE deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
                (f'-{SNAPSHOT_DAYS} days',),
            )
    finally:
        conn.close()

# The signed-in user's data as a JSON file download.
@bp.get('/account/export')
@require_login
def export_account():
    conn = connect()
    try:
        data = collect_account(conn, current_user(conn)['id'], include_secrets=False)
    finally:
        conn.close()
    data['exported_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    filename = f'quill-account-{data["user"]["username"]}.json'
    return Response(
        json.dumps(data, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

# Body: {mode: 'snapshot' | 'erase', confirm}. confirm must be the username for 'snapshot'
# and the erase phrase for 'erase', checked here as well as in the dialog.
# 'snapshot' keeps a copy in deleted_accounts for 30 days; 'erase' keeps nothing.
@bp.delete('/account')
@require_login
@limit('account-delete', 5, 60 * 60)
def delete_account():
    content = json_body()
    mode = content.get('mode') if content else None
    confirm = content.get('confirm') if content else None
    user = g.user
    if user['is_admin']:
        return error('The admin account can’t be deleted from the web app.', 403)
    if mode not in ('snapshot', 'erase'):
        return error('mode must be "snapshot" or "erase".', 400)
    expected = user['username'] if mode == 'snapshot' else ERASE_PHRASE
    if confirm != expected:
        return error('The confirmation text doesn’t match.', 400)

    conn = connect()
    try:
        if mode == 'erase':
            # Overwrite deleted rows on disk instead of only marking the space free.
            conn.execute('PRAGMA secure_delete = ON')
        with conn:
            # Campaigns and invites point at their creator without cascading. Only the admin
            # can make either today, so this is a guard against a future change.
            owns = conn.execute(
                'SELECT EXISTS (SELECT 1 FROM campaigns WHERE owner_id = ?) '
                'OR EXISTS (SELECT 1 FROM invites WHERE created_by = ?)',
                (user['id'], user['id']),
            ).fetchone()[0]
            if owns:
                return error('This account owns campaigns or invites. Ask the admin to move them first.', 409)
            if mode == 'snapshot':
                snapshot = collect_account(conn, user['id'], include_secrets=True)
                conn.execute(
                    'INSERT OR REPLACE INTO deleted_accounts (id, username, snapshot) VALUES (?, ?, ?)',
                    (user['id'], user['username'], json.dumps(snapshot)),
                )
            else:
                # An older snapshot of this account would otherwise survive the erase.
                conn.execute('DELETE FROM deleted_accounts WHERE id = ?', (user['id'],))
            # Memberships and characters (with their notes) go with it (ON DELETE CASCADE).
            conn.execute('DELETE FROM users WHERE id = ?', (user['id'],))
        if mode == 'erase':
            # Fold the write-ahead log into the database, so no copy of the rows lingers there.
            conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    finally:
        conn.close()
    session.clear()
    return jsonify({'success': True}), 200
