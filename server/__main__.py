from server import create_app
from server.db import init_db

init_db()
create_app().run(port=5174, debug=False)
