from flask import Blueprint, Flask

from server.routes import campaigns, invites, users

def create_app():
    app = Flask(__name__)
    # Reject requests addressed to any other hostname, so a page using DNS rebinding
    # (a domain re-pointed at 127.0.0.1) can't reach the API. Ports are ignored; the
    # Vite proxy forwards the browser's localhost:5173 Host header unchanged.
    app.config['TRUSTED_HOSTS'] = ['localhost', '127.0.0.1']
    # Larger bodies get 413 before any route runs.
    app.config['MAX_CONTENT_LENGTH'] = 1_000_000

    api = Blueprint('api', __name__, url_prefix='/api')
    for module in (users, campaigns, invites):
        api.register_blueprint(module.bp)
    app.register_blueprint(api)
    return app
