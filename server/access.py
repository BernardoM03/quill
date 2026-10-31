from functools import wraps

from flask import g

from server.db import connect
from server.helpers import error

# Every API route must carry exactly one of these: public, require_login, require_member
# or require_admin. create_app refuses to start otherwise, so a route can't end up open
# to everyone just because a decorator was forgotten. Put it directly under @bp.<method>.

def _mark(view, level):
    view.access = level
    return view

# Reachable without signing in.
def public(view):
    return _mark(view, 'public')

# Needs a signed-in user: 401 otherwise, which the frontend turns into a trip to /login.
def require_login(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        return view(*args, **kwargs)
    return _mark(wrapped, 'login')

# Needs a signed-in member of the campaign in the route's <campaign_id>; the admin always
# passes. Non-members get 404, the same as a campaign that doesn't exist.
def require_member(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        if not g.user['is_admin']:
            conn = connect()
            try:
                member = conn.execute(
                    'SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ?',
                    (kwargs['campaign_id'], g.user['id']),
                ).fetchone()
            finally:
                conn.close()
            if member is None:
                return error('Campaign not found', 404)
        return view(*args, **kwargs)
    return _mark(wrapped, 'member')

# Needs a signed-in admin. Other signed-in users get 404, so they don't learn the route exists.
def require_admin(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        if not g.user['is_admin']:
            return error('Not found', 404)
        return view(*args, **kwargs)
    return _mark(wrapped, 'admin')
