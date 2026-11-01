import os
import sqlite3

# Lives outside public/ so Vite never serves it.
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DB_PATH = os.path.join(DATA_DIR, 'quill.db')

# Each entry upgrades the schema by one version. Append new ones; never edit applied ones.
MIGRATIONS = [
    # 1: meta table only (created by init_db itself)
    '',
    # 2: core tables
    '''
    CREATE TABLE users (
        id            TEXT PRIMARY KEY,                 -- UUID
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name  TEXT NOT NULL,
        password_hash TEXT,                             -- NULL until set
        is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at    TEXT                              -- soft delete; admin may restore within 30 days
    );

    CREATE TABLE campaigns (
        id          TEXT PRIMARY KEY,                   -- UUID
        owner_id    TEXT NOT NULL REFERENCES users(id),
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        settings    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),  -- allowedContent, alternate rules, visibility
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE memberships (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role        TEXT NOT NULL CHECK (role IN ('gm', 'player')),
        joined_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (campaign_id, user_id)
    );
    CREATE INDEX memberships_user ON memberships(user_id);

    CREATE TABLE characters (
        id             TEXT PRIMARY KEY,                -- UUID
        campaign_id    TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        sheet          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sheet)),
        personal_notes TEXT NOT NULL DEFAULT '',        -- owner and admin only; kept out of sheet
        is_active      INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at     TEXT
    );
    CREATE INDEX characters_campaign ON characters(campaign_id);
    -- At most one active character per player per campaign.
    CREATE UNIQUE INDEX characters_one_active
        ON characters(campaign_id, owner_id) WHERE is_active = 1 AND deleted_at IS NULL;

    CREATE TABLE invites (
        id          TEXT PRIMARY KEY,                   -- UUID
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        created_by  TEXT NOT NULL REFERENCES users(id),
        token_hash  TEXT NOT NULL UNIQUE,               -- SHA-256 of the link token; raw token is never stored
        max_uses    INTEGER CHECK (max_uses IS NULL OR max_uses > 0),  -- NULL = unlimited
        use_count   INTEGER NOT NULL DEFAULT 0,
        expires_at  TEXT,                               -- NULL = never
        revoked_at  TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX invites_campaign ON invites(campaign_id);
    ''',
    # 3: snapshots of deleted accounts, kept 30 days so the admin can restore them
    '''
    CREATE TABLE deleted_accounts (
        id         TEXT PRIMARY KEY,                    -- the deleted user's id
        username   TEXT NOT NULL,
        snapshot   TEXT NOT NULL CHECK (json_valid(snapshot)),  -- user, memberships, characters
        deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    ''',
    # 4: a character belongs to its owner's membership, so removing a player from a
    # campaign deletes their characters there. SQLite can't add a foreign key to an
    # existing table, so the table is rebuilt; characters with no membership are dropped.
    '''
    CREATE TABLE characters_new (
        id             TEXT PRIMARY KEY,
        campaign_id    TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        sheet          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sheet)),
        personal_notes TEXT NOT NULL DEFAULT '',
        is_active      INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at     TEXT,
        FOREIGN KEY (campaign_id, owner_id) REFERENCES memberships(campaign_id, user_id) ON DELETE CASCADE
    );
    INSERT INTO characters_new
        SELECT ch.* FROM characters ch
        JOIN memberships m ON m.campaign_id = ch.campaign_id AND m.user_id = ch.owner_id;
    DROP TABLE characters;
    ALTER TABLE characters_new RENAME TO characters;
    CREATE INDEX characters_campaign ON characters(campaign_id);
    CREATE INDEX characters_owner ON characters(owner_id);
    -- At most one active character per player per campaign.
    CREATE UNIQUE INDEX characters_one_active
        ON characters(campaign_id, owner_id) WHERE is_active = 1 AND deleted_at IS NULL;
    ''',
    # 5: Character Sandbox. campaign_id may be NULL for a character that isn't in any
    # campaign; it belongs to its owner alone. SQLite skips a composite foreign key when
    # one of its columns is NULL, so the membership link still holds for campaign characters.
    # Sandbox characters are never "active" (that's per campaign).
    '''
    CREATE TABLE characters_new (
        id             TEXT PRIMARY KEY,
        campaign_id    TEXT REFERENCES campaigns(id) ON DELETE CASCADE,  -- NULL: Character Sandbox
        owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        sheet          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sheet)),
        personal_notes TEXT NOT NULL DEFAULT '',
        is_active      INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        deleted_at     TEXT,
        FOREIGN KEY (campaign_id, owner_id) REFERENCES memberships(campaign_id, user_id) ON DELETE CASCADE,
        CHECK (campaign_id IS NOT NULL OR is_active = 0)
    );
    INSERT INTO characters_new SELECT * FROM characters;
    DROP TABLE characters;
    ALTER TABLE characters_new RENAME TO characters;
    CREATE INDEX characters_campaign ON characters(campaign_id);
    CREATE INDEX characters_owner ON characters(owner_id);
    -- At most one active character per player per campaign.
    CREATE UNIQUE INDEX characters_one_active
        ON characters(campaign_id, owner_id) WHERE is_active = 1 AND deleted_at IS NULL;
    ''',
    # 6: character portraits. A separate table keeps characters rows small; the cascade
    # removes a portrait with its character, however the character goes.
    '''
    CREATE TABLE character_portraits (
        character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
        image        BLOB NOT NULL,                     -- 256x256 WebP, re-encoded by the server
        updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    ''',
]
SCHEMA_VERSION = len(MIGRATIONS)

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

# Creates the database on first run and applies any pending migrations. Safe to call on every startup.
def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = connect()
    try:
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')")
        conn.commit()
        current = int(conn.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()['value'])
        for version in range(current + 1, SCHEMA_VERSION + 1):
            # executescript commits first, so wrap each migration in its own transaction.
            conn.executescript(
                'BEGIN;' + MIGRATIONS[version - 1] +
                f"UPDATE meta SET value = '{version}' WHERE key = 'schema_version'; COMMIT;"
            )
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
    print(f'Database ready at {os.path.realpath(DB_PATH)} (schema v{SCHEMA_VERSION})')
