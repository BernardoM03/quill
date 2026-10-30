import os
import sqlite3

# Lives outside public/ so Vite never serves it.
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DB_PATH = os.path.join(DATA_DIR, 'quill.db')

SCHEMA_VERSION = 1

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

# Creates the database file and the meta table on first run. Safe to call on every startup.
def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with connect() as conn:
        conn.execute('PRAGMA journal_mode = WAL')
        conn.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)", (str(SCHEMA_VERSION),))
    conn.close()

if __name__ == '__main__':
    init_db()
    print(f'Database ready at {os.path.realpath(DB_PATH)}')
