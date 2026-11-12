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
        settings    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings)),  -- rules; allowed content moved to tables in migration 9
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
    # 7: character drafts: a creation wizard in progress, saved as the player goes so they
    # can come back to it. Like characters, a campaign draft hangs off the membership, so
    # leaving or being removed from the campaign removes it; campaign_id NULL is the sandbox.
    '''
    CREATE TABLE character_drafts (
        id          TEXT PRIMARY KEY,
        owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,  -- NULL: Character Sandbox
        draft       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(draft)),
        step        TEXT,                               -- the wizard step to reopen on
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (campaign_id, owner_id) REFERENCES memberships(campaign_id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX character_drafts_owner ON character_drafts(owner_id);
    ''',
    # 8: ability score rolls, made by the server and kept with the draft so a player can't
    # roll again until they like the result. Saving the draft never touches them.
    '''
    ALTER TABLE character_drafts ADD COLUMN rolls TEXT CHECK (rolls IS NULL OR json_valid(rolls));
    ''',
    # 9: allowed content moves out of campaigns.settings into rows. A collection in
    # campaign_content_limits is limited to its rows in campaign_content; a collection that
    # isn't there allows everything in it. Settings keep only the rules (and lose the unused
    # alternate rules keys).
    '''
    CREATE TABLE campaign_content_limits (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        collection  TEXT NOT NULL,                      -- a pack collection: species, spells, ...
        PRIMARY KEY (campaign_id, collection)
    ) WITHOUT ROWID;
    CREATE TABLE campaign_content (
        campaign_id TEXT NOT NULL,
        collection  TEXT NOT NULL,
        entry_id    TEXT NOT NULL,                      -- a pack id: srd-5.2:spell/fireball
        PRIMARY KEY (campaign_id, collection, entry_id),
        FOREIGN KEY (campaign_id, collection) REFERENCES campaign_content_limits(campaign_id, collection) ON DELETE CASCADE
    ) WITHOUT ROWID;
    INSERT INTO campaign_content_limits (campaign_id, collection)
        SELECT c.id, coll.key FROM campaigns c, json_each(c.settings, '$.allowedContent') coll
        WHERE coll.type = 'array';
    INSERT OR IGNORE INTO campaign_content (campaign_id, collection, entry_id)
        SELECT c.id, coll.key, ids.value FROM campaigns c, json_each(c.settings, '$.allowedContent') coll,
            json_each(coll.value) ids
        WHERE coll.type = 'array' AND ids.type = 'text';
    UPDATE campaigns SET settings = json_remove(settings, '$.allowedContent', '$.alternateRules', '$."alternate-rules"');
    ''',
    # 10: drafts get a format version (schemas/records/draft.schema.json), and choices the
    # player cleared are left out instead of stored as "" or [].
    '''
    UPDATE character_drafts SET draft = json_set(draft, '$.speciesChoices', (
        SELECT json_group_object(key, CASE WHEN type IN ('array', 'object') THEN json(value) ELSE value END)
        FROM json_each(character_drafts.draft, '$.speciesChoices')
        WHERE NOT (type = 'text' AND value = '') AND NOT (type = 'array' AND json_array_length(value) = 0)
    ));
    UPDATE character_drafts SET draft = json_set(draft, '$.backgroundChoices', (
        SELECT json_group_object(key, CASE WHEN type IN ('array', 'object') THEN json(value) ELSE value END)
        FROM json_each(character_drafts.draft, '$.backgroundChoices')
        WHERE NOT (type = 'text' AND value = '') AND NOT (type = 'array' AND json_array_length(value) = 0)
    ));
    UPDATE character_drafts SET draft = json_set(draft, '$.classChoices', (
        SELECT json_group_object(key, CASE WHEN type IN ('array', 'object') THEN json(value) ELSE value END)
        FROM json_each(character_drafts.draft, '$.classChoices')
        WHERE NOT (type = 'text' AND value = '') AND NOT (type = 'array' AND json_array_length(value) = 0)
    ));
    UPDATE character_drafts SET draft = json_set(draft, '$.version', 1);
    ''',
    # 11: character approval. draft: saved but not yet submitted. pending: waiting for the
    # GM (the campaign has characterApproval on). approved: playable. rejected: sent back,
    # with review_reason; the owner edits and submits again. Only an approved character can
    # be active. Every existing character was playable, so they start approved.
    '''
    ALTER TABLE characters ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
    ALTER TABLE characters ADD COLUMN review_reason TEXT;
    CREATE INDEX characters_pending ON characters(campaign_id) WHERE status = 'pending';
    ''',
    # 12: changes to an approved character's approved picks (species, background, class and
    # their choices, ability scores), logged for the GM of a campaign with characterApproval
    # on. changes: [{field, from, to}]. dismissed_at: the GM has seen it. Picks made for the
    # first time (a choice gained on levelling up) aren't changes and aren't logged.
    '''
    CREATE TABLE character_changes (
        id           TEXT PRIMARY KEY,
        campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        changes      TEXT NOT NULL CHECK (json_valid(changes)),
        created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        dismissed_at TEXT
    );
    CREATE INDEX character_changes_campaign ON character_changes(campaign_id, created_at);
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
