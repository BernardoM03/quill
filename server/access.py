from functools import wraps

from flask import g

from server.db import connection
from server.helpers import error

# Every API route carries exactly one of these decorators, placed directly under @bp.<method>.
# create_app refuses to start if one is missing.

def _mark(view, level):
    view.access = level
    return view

def _is_member(campaign_id, user_id):
    with connection() as conn:
        return conn.execute(
            'SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ?',
            (campaign_id, user_id),
        ).fetchone() is not None

def public(view):
    return _mark(view, 'public')

# A 401 tells the frontend to send the user to /login.
def require_login(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        return view(*args, **kwargs)
    return _mark(wrapped, 'login')

# Requires membership of the route's <campaign_id>; non-members get the same 404 as a missing campaign.
def require_member(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        if not g.user['is_admin'] and not _is_member(kwargs['campaign_id'], g.user['id']):
            return error('Campaign not found', 404)
        return view(*args, **kwargs)
    return _mark(wrapped, 'member')

# Non-admins get 404 so they don't learn the route exists.
def require_admin(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.user is None:
            return error('Sign in first.', 401)
        if not g.user['is_admin']:
            return error('Not found', 404)
        return view(*args, **kwargs)
    return _mark(wrapped, 'admin')
