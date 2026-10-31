# Game and campaign rules, kept on the server so they have one source of truth:
#   packs     - loads the installed content packs from packs/ (served only through the API)
#   campaign  - checks a campaign settings change before it's saved
#   problems  - what a campaign's settings are missing before characters can be made
#   spells    - spell list rules (classes left without cantrips)
from server.rules.campaign import validate_campaign_patch

__all__ = ['validate_campaign_patch']
