import argparse
import json
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone

from server.db import DATA_DIR, connect, init_db

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
USER_JSON_PATH = os.path.join(PUBLIC_DIR, 'user.json')
CAMPAIGNS_DIR = os.path.join(PUBLIC_DIR, '.campaigns')

# Keys stored in their own columns; everything else in a campaign file goes into settings.
CAMPAIGN_COLUMN_KEYS = {'id', 'name', 'description', 'characters'}

def canonical_uuid(value):
    try:
        parsed = str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None
    return parsed if parsed == value else None

def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

# Imports public/user.json as the admin user and every campaign it lists or that has a
# file in public/.campaigns/. Safe to re-run: existing rows are left alone.
def migrate_json(keep_files):
    if not os.path.exists(USER_JSON_PATH):
        print(f'Nothing to import: {os.path.realpath(USER_JSON_PATH)} not found.')
        return 0

    user = load_json(USER_JSON_PATH)
    username = ' '.join(str(user.get('name') or '').split())
    if not username:
        print('user.json has no name; aborting.', file=sys.stderr)
        return 1

    # Gather campaigns from both the user.json index and the campaign files.
    campaigns = {}
    for entry in user.get('campaigns') or []:
        campaign_id = canonical_uuid(entry.get('id'))
        if campaign_id:
            campaigns[campaign_id] = {'name': entry.get('name')}
    campaign_files = []
    if os.path.isdir(CAMPAIGNS_DIR):
        for filename in sorted(os.listdir(CAMPAIGNS_DIR)):
            campaign_id = canonical_uuid(filename.removesuffix('.json'))
            if not filename.endswith('.json') or campaign_id is None:
                print(f'Skipping unrecognised file .campaigns/{filename}')
                continue
            campaign_files.append(filename)
            details = load_json(os.path.join(CAMPAIGNS_DIR, filename))
            campaigns.setdefault(campaign_id, {}).update(details)

    init_db()
    conn = connect()
    try:
        with conn:
            row = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
            if row:
                user_id = row['id']
                print(f'User "{username}" already exists; reusing.')
            else:
                user_id = str(uuid.uuid4())
                conn.execute(
                    'INSERT INTO users (id, username, display_name, is_admin) VALUES (?, ?, ?, 1)',
                    (user_id, username, username),
                )
                print(f'Created admin user "{username}".')

            for campaign_id, details in campaigns.items():
                if details.get('characters'):
                    print(f'Warning: campaign {campaign_id} has characters; they are not imported.')
                name = ' '.join(str(details.get('name') or '').split()) or 'Untitled campaign'
                settings = {k: v for k, v in details.items() if k not in CAMPAIGN_COLUMN_KEYS}
                inserted = conn.execute(
                    'INSERT OR IGNORE INTO campaigns (id, owner_id, name, description, settings) VALUES (?, ?, ?, ?, ?)',
                    (campaign_id, user_id, name, details.get('description') or '', json.dumps(settings)),
                ).rowcount
                conn.execute(
                    "INSERT OR IGNORE INTO memberships (campaign_id, user_id, role) VALUES (?, ?, 'gm')",
                    (campaign_id, user_id),
                )
                print(f'{"Imported" if inserted else "Already present"}: {name} ({campaign_id})')
    finally:
        conn.close()

    if keep_files:
        return 0

    # Move rather than delete, so the originals can be recovered if the import was wrong.
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup_dir = os.path.join(DATA_DIR, 'legacy-json', stamp)
    os.makedirs(os.path.join(backup_dir, '.campaigns'))
    shutil.move(USER_JSON_PATH, os.path.join(backup_dir, 'user.json'))
    for filename in campaign_files:
        shutil.move(os.path.join(CAMPAIGNS_DIR, filename), os.path.join(backup_dir, '.campaigns', filename))
    if os.path.isdir(CAMPAIGNS_DIR) and not os.listdir(CAMPAIGNS_DIR):
        os.rmdir(CAMPAIGNS_DIR)
    print(f'Moved originals out of public/ to {os.path.realpath(backup_dir)}')
    return 0

def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m server.cli')
    commands = parser.add_subparsers(dest='command', required=True)
    migrate = commands.add_parser('migrate-json', help='import public/user.json and public/.campaigns/*.json into SQLite')
    migrate.add_argument('--keep-files', action='store_true', help='leave the JSON files in public/ after importing')
    args = parser.parse_args(argv)

    if args.command == 'migrate-json':
        return migrate_json(args.keep_files)

if __name__ == '__main__':
    sys.exit(main())
