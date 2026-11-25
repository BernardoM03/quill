import base64
import json
import threading
from datetime import datetime, timezone

from flask import Blueprint, Response, g, jsonify, session

from server.access import require_login
from server.db import connection
from server.helpers import current_user, error, json_body
from server.ratelimit import limit

# The phrase a player types to erase everything without keeping a snapshot.
ERASE_PHRASE = 'All data completely removed'
SNAPSHOT_DAYS = 30
PURGE_INTERVAL_SECONDS = 24 * 60 * 60

bp = Blueprint('account', __name__)

_stop_purge = threading.Event()

# Everything stored about a user; include_secrets adds the password hash the admin needs to restore it.
def collect_account(conn, user_id, include_secrets):
    user = dict(conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone())
    if not include_secrets:
        user.pop('password_hash', None)
    memberships = [dict(row) for row in conn.execute(
        'SELECT m.campaign_id, c.name AS campaign_name, m.role, m.joined_at '
        'FROM memberships m JOIN campaigns c ON c.id = m.campaign_id WHERE m.user_id = ? ORDER BY m.joined_at',
        (user_id,),
    )]
    characters = []
    for row in conn.execute(
        'SELECT ch.*, p.image AS portrait FROM characters ch '
        'LEFT JOIN character_portraits p ON p.character_id = ch.id WHERE ch.owner_id = ? ORDER BY ch.created_at',
        (user_id,),
    ):
        character = dict(row)
        character['sheet'] = json.loads(character['sheet'])
        # Base64 lets the WebP portrait travel inside JSON.
        if character['portrait'] is not None:
            character['portrait'] = base64.b64encode(character['portrait']).decode('ascii')
        characters.append(character)
    return {'user': user, 'memberships': memberships, 'characters': characters}

# Permanently overwrites snapshots past their restore window and returns how many were removed.
def purge_old_snapshots():
    with connection() as conn:
        conn.execute('PRAGMA secure_delete = ON')
        with conn:
            removed = conn.execute(
                "DELETE FROM deleted_accounts WHERE deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
                (f'-{SNAPSHOT_DAYS} days',),
            ).rowcount
        if removed:
            conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    return removed

# Purges now and then daily on a daemon thread that stops with the server.
def start_daily_purge():
    def run():
        while True:
            try:
                removed = purge_old_snapshots()
                if removed:
                    print(f'Quill: permanently deleted {removed} account snapshot(s) older than {SNAPSHOT_DAYS} days.', flush=True)
            except Exception as e:  # A failed run shouldn't stop later ones.
                print(f'Quill: account snapshot cleanup failed: {e}', flush=True)
            if _stop_purge.wait(PURGE_INTERVAL_SECONDS):
                return
    threading.Thread(target=run, name='snapshot-purge', daemon=True).start()

@bp.get('/account/export')
@require_login
def export_account():
    with connection() as conn:
        data = collect_account(conn, current_user(conn)['id'], include_secrets=False)
    data['exported_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    filename = f'quill-account-{data["user"]["username"]}.json'
    return Response(
        json.dumps(data, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

def _owns_campaigns_or_invites(conn, user_id):
    return conn.execute(
        'SELECT EXISTS (SELECT 1 FROM campaigns WHERE owner_id = ?) '
        'OR EXISTS (SELECT 1 FROM invites WHERE created_by = ?)',
        (user_id, user_id),
    ).fetchone()[0]

# Body: {mode: 'snapshot' | 'erase', confirm}.
# confirm must be the username for 'snapshot' and ERASE_PHRASE for 'erase'.
# 'snapshot' keeps a restorable copy for SNAPSHOT_DAYS, while 'erase' keeps nothing.
@bp.delete('/account')
@require_login
@limit('account-delete', 5, 60 * 60)
def delete_account():
    content = json_body() or {}
    mode = content.get('mode')
    confirm = content.get('confirm')
    user = g.user
    if user['is_admin']:
        return error('The admin account can’t be deleted from the web app.', 403)
    if mode not in ('snapshot', 'erase'):
        return error('mode must be "snapshot" or "erase".', 400)
    expected_confirm = user['username'] if mode == 'snapshot' else ERASE_PHRASE
    if confirm != expected_confirm:
        return error('The confirmation text doesn’t match.', 400)

    erasing = mode == 'erase'
    with connection() as conn:
        if erasing:
            # Overwrite deleted rows on disk instead of only marking the space free.
            conn.execute('PRAGMA secure_delete = ON')
        with conn:
            # Campaigns and invites reference their creator without cascading.
            if _owns_campaigns_or_invites(conn, user['id']):
                return error('This account owns campaigns or invites. Ask the admin to move them first.', 409)
            if erasing:
                # An older snapshot of this account would otherwise survive the erase.
                conn.execute('DELETE FROM deleted_accounts WHERE id = ?', (user['id'],))
            else:
                snapshot = collect_account(conn, user['id'], include_secrets=True)
                conn.execute(
                    'INSERT OR REPLACE INTO deleted_accounts (id, username, snapshot) VALUES (?, ?, ?)',
                    (user['id'], user['username'], json.dumps(snapshot)),
                )
            # Memberships and characters go with the user through ON DELETE CASCADE.
            conn.execute('DELETE FROM users WHERE id = ?', (user['id'],))
        if erasing:
            # Folding the write-ahead log into the database leaves no copy of the rows there.
            conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    session.clear()
    return jsonify({'success': True}), 200
