# A campaign's allowed content, kept in two tables (server/db.py migration 9):
#   campaign_content_limits  (campaign_id, collection): this collection is limited
#   campaign_content         (campaign_id, collection, entry_id): one allowed entry
# A collection with no limit row allows everything in it, including content installed
# later; a limited one allows exactly its rows (none, if it has no rows).
#
# The rules engine and the API use the same shape as before: {collection: [ids]}, with a
# collection missing for "everything allowed".

# {collection: [entry ids]} for every limited collection of the campaign.
def load_allowed(conn, campaign_id):
    allowed = {row['collection']: [] for row in conn.execute(
        'SELECT collection FROM campaign_content_limits WHERE campaign_id = ?', (campaign_id,))}
    for row in conn.execute(
            'SELECT collection, entry_id FROM campaign_content WHERE campaign_id = ? ORDER BY collection, entry_id',
            (campaign_id,)):
        allowed[row['collection']].append(row['entry_id'])
    return allowed

# Applies {collection: [ids] | None} to the campaign: a list limits the collection to
# exactly those ids, None lifts the limit. Collections not named are left as they are.
# Runs inside the caller's transaction.
def save_allowed(conn, campaign_id, changes):
    for collection, ids in changes.items():
        # Deleting the limit row also deletes its entries (ON DELETE CASCADE).
        conn.execute('DELETE FROM campaign_content_limits WHERE campaign_id = ? AND collection = ?',
                     (campaign_id, collection))
        if ids is None:
            continue
        conn.execute('INSERT INTO campaign_content_limits (campaign_id, collection) VALUES (?, ?)',
                     (campaign_id, collection))
        conn.executemany('INSERT OR IGNORE INTO campaign_content (campaign_id, collection, entry_id) VALUES (?, ?, ?)',
                         [(campaign_id, collection, i) for i in ids])
