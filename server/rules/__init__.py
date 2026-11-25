# Game and campaign rules live on the server so they have one source of truth.
from server.rules.campaign import validate_campaign_patch

__all__ = ['validate_campaign_patch']
