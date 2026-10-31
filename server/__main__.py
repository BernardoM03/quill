import sys

from server import create_app
from server.config import ConfigError
from server.db import init_db
from server.routes import setup

try:
    app = create_app()
except ConfigError as e:
    sys.exit(f'Quill: configuration error: {e}')

init_db()
setup.bootstrap()
app.run(port=5174, debug=False)
