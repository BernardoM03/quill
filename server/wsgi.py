# Production entry point: gunicorn 'server.wsgi:app'.
# Run exactly one worker process. Rate limits, the one-time setup link and the snapshot-purge
# thread all live in process memory, so a second worker would split or duplicate them.
# Scale with --threads instead.
import sys

from server import create_app
from server.config import ConfigError
from server.db import init_db
from server.routes import account, setup

def start():
    try:
        app = create_app()
    except ConfigError as e:
        sys.exit(f'Quill: configuration error: {e}')
    init_db()
    account.start_daily_purge()
    setup.bootstrap()
    return app

app = start()
