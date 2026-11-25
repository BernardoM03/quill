# A campaign's allowed content is stored as {collection: [entry ids]}.
# A collection with no limit row allows everything, including content installed later.
# A limited collection allows exactly its rows, which may be none.

def load_allowed(conn, campaign_id):
    allowed = {row['collection']: [] for row in conn.execute(
        'SELECT collection FROM campaign_content_limits WHERE campaign_id = ?', (campaign_id,))}
    for row in conn.execute(
            'SELECT collection, entry_id FROM campaign_content WHERE campaign_id = ? ORDER BY collection, entry_id',
            (campaign_id,)):
        allowed[row['collection']].append(row['entry_id'])
    return allowed

# Applies {collection: [ids] | None}, where None lifts the limit and unnamed collections are untouched.
# Runs inside the caller's transaction.
def save_allowed(conn, campaign_id, changes):
    for collection, entry_ids in changes.items():
        # ON DELETE CASCADE removes the collection's entries along with its limit row.
        conn.execute('DELETE FROM campaign_content_limits WHERE campaign_id = ? AND collection = ?',
                     (campaign_id, collection))
        if entry_ids is None:
            continue
        conn.execute('INSERT INTO campaign_content_limits (campaign_id, collection) VALUES (?, ?)',
                     (campaign_id, collection))
        conn.executemany('INSERT OR IGNORE INTO campaign_content (campaign_id, collection, entry_id) VALUES (?, ?, ?)',
                         [(campaign_id, collection, entry_id) for entry_id in entry_ids])
