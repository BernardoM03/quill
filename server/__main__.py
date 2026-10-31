from server import create_app
from server.db import init_db
from server.routes import setup

init_db()
setup.bootstrap()
create_app().run(port=5174, debug=False)
