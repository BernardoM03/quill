import sys

from server import create_app
from server.config import ConfigError
from server.db import init_db
from server.routes import account, setup

try:
    app = create_app()
except ConfigError as e:
    sys.exit(f'Quill: configuration error: {e}')

init_db()
account.start_daily_purge()
setup.bootstrap()
app.run(port=5174, debug=False)
