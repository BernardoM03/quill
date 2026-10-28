from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import re, uuid

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
USER_JSON_URL = os.path.join(PUBLIC_DIR, 'user.json')
CAMPAIGNS_FOLDER_URL = os.path.join(PUBLIC_DIR, '.campaigns') + os.sep

CAMPAIGN_NAME_MAX_LENGTH = 64
CAMPAIGN_DESCRIPTION_MAX_LENGTH = 10000

def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = ' '.join(raw.split())
    if not 1 <= len(name) <= CAMPAIGN_NAME_MAX_LENGTH or re.search(r'[\x00-\x1f\x7f]', name):
        return None
    return name

# Returns the campaign's file path, or None if campaign_id isn't a canonical UUID.
# The filename is built from the parsed UUID, never the raw request string, so the
# path can't leave the campaigns folder; the commonpath check is a second guard.
def campaign_file_path(campaign_id):
    try:
        safe_id = str(uuid.UUID(campaign_id))
    except (ValueError, TypeError, AttributeError):
        return None
    if safe_id != campaign_id:
        return None
    base_dir = os.path.realpath(CAMPAIGNS_FOLDER_URL)
    candidate = os.path.realpath(os.path.join(base_dir, f'{safe_id}.json'))
    if os.path.commonpath([base_dir, candidate]) != base_dir:
        return None
    return candidate

app = Flask(__name__)
CORS(app)

@app.route('/create/user', methods=['POST'])
def create_user():
    content = request.get_json()
    username = content.get('name')
    
    with open(USER_JSON_URL, 'w') as f:
        data = {
            "name": username,
            "campaigns": []
        }
        json.dump(data, f, indent=4)
    
    return jsonify({'success': True}), 201
    

@app.route('/create/campaign', methods=['POST'])
def create_campaign():
    content = request.get_json()
    campaign_id = content.get('id')
    campaign_name = clean_name(content.get('name'))
    if campaign_name is None:
        return jsonify({'error': f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.'}), 400
    campaign_path = campaign_file_path(campaign_id)
    if campaign_path is None:
        return jsonify({'error': 'Invalid campaign id.'}), 400
    content = {'name': campaign_name, 'id': campaign_id}

    with open(campaign_path, 'w') as f:
        details = {
            "name": campaign_name,
            "description": None,
            "characters": [],
            "alternateRules": [],
            "allowedContent": {},
            "rules": {}
        }
        json.dump(details, f, indent=4)
        
    with open(USER_JSON_URL, 'r') as f:
        data = json.load(f)
    
    data['campaigns'].append(content)
    
    with open(USER_JSON_URL, 'w') as f:
        json.dump(data, f, indent=4)
        
    return jsonify(content), 201

@app.route('/update/campaign-name', methods=['PUT'])
def update_user_campaign():
    content = request.get_json()
    campaign_id = content.get('id')
    new_name = content.get('name')
    
    new_name = clean_name(content.get('name'))
    if new_name is None:
        return jsonify({'error': f'Name must be 1–{CAMPAIGN_NAME_MAX_LENGTH} characters.'}), 400
    campaign_path = campaign_file_path(campaign_id)
    if campaign_path is None:
        return jsonify({'error': 'Invalid campaign id.'}), 400
    
    # Update campaign info in user.json
    with open(USER_JSON_URL, 'r') as f:
        data = json.load(f)

    campaign = next((c for c in data['campaigns'] if c['id'] == campaign_id), None)

    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    campaign['name'] = new_name

    with open(USER_JSON_URL, 'w') as f:
        json.dump(data, f, indent=4)
    
    # Update campaign info in ${campaign_id}.json
    
    with open(campaign_path, 'r') as f:
        details = json.load(f)
        
    details['name'] = new_name
    
    with open(campaign_path, 'w') as f:
        json.dump(details, f, indent=4)

    return jsonify({'success': True, 'campaign': campaign}), 200

@app.route('/campaign/<campaign_id>', methods=['GET'])
def get_campaign(campaign_id):
    campaign_path = campaign_file_path(campaign_id)
    if campaign_path is None or not os.path.exists(campaign_path):
        return jsonify({'error': 'Campaign not found'}), 404
    with open(campaign_path, 'r') as f:
        details = json.load(f)
    # Files made before allowedContent existed: missing means everything is allowed.
    details.setdefault('allowedContent', {})
    details.setdefault('rules', {})
    return jsonify(details), 200

# Body: {id, collection, ids}. ids is a list of pack ids, or null for "everything allowed".
@app.route('/update/campaign-allowed', methods=['PUT'])
def update_campaign_allowed():
    content = request.get_json()
    collection = content.get('collection')
    ids = content.get('ids')
    if not isinstance(collection, str) or not re.fullmatch(r'[a-z-]+', collection):
        return jsonify({'error': 'Invalid collection.'}), 400
    if ids is not None and not (isinstance(ids, list) and all(isinstance(i, str) for i in ids)):
        return jsonify({'error': 'ids must be a list of strings or null.'}), 400
    # A campaign with no species or no classes can't make characters.
    if collection in ('species', 'classes') and ids == []:
        return jsonify({'error': f'At least one entry in {collection} must stay allowed.'}), 400
    campaign_path = campaign_file_path(content.get('id'))
    if campaign_path is None or not os.path.exists(campaign_path):
        return jsonify({'error': 'Campaign not found'}), 404

    with open(campaign_path, 'r') as f:
        details = json.load(f)
    details.setdefault('allowedContent', {})[collection] = ids
    with open(campaign_path, 'w') as f:
        json.dump(details, f, indent=4)

    return jsonify({'success': True}), 200

@app.route('/update/campaign-description', methods=['PUT'])
def update_campaign_description():
    content = request.get_json()
    description = content.get('description')
    if not isinstance(description, str) or len(description) > CAMPAIGN_DESCRIPTION_MAX_LENGTH:
        return jsonify({'error': f'Description must be at most {CAMPAIGN_DESCRIPTION_MAX_LENGTH} characters.'}), 400
    campaign_path = campaign_file_path(content.get('id'))
    if campaign_path is None or not os.path.exists(campaign_path):
        return jsonify({'error': 'Campaign not found'}), 404

    with open(campaign_path, 'r') as f:
        details = json.load(f)
    details['description'] = description.strip() or None
    with open(campaign_path, 'w') as f:
        json.dump(details, f, indent=4)

    return jsonify({'success': True}), 200

# Each rule's check. Mirrors src/datatypes/campaignRules.ts. bool is a subclass of
# int in Python, so the level check rules bools out explicitly.
def is_bool(v): return isinstance(v, bool)
RULE_CHECKS = {
    'optionalClassFeatures': is_bool,
    'customizeOrigin': is_bool,
    'advancement': lambda v: v in ('xp', 'milestone'),
    'milestoneLevel': lambda v: isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 20,
    'hitPoints': lambda v: v in ('automatic', 'manual'),
    'featPrerequisites': is_bool,
    'multiclassPrerequisites': is_bool,
    'encumbrance': is_bool,
    'ignoreCoinWeight': is_bool,
    'allowMulticlass': is_bool,
    'abilityScoreMethod': lambda v: v in ('standardArray', 'pointBuy', 'roll', 'manual', 'sharedManual'),
    'sharedScores': lambda v: isinstance(v, list) and len(v) == 6
        and all(isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 20 for n in v),
    'pointBuyBudget': lambda v: isinstance(v, int) and not isinstance(v, bool) and 15 <= v <= 40,
    'startingEquipment': lambda v: v in ('choice', 'equipment', 'gold'),
    'originFeat': lambda v: v in ('background', 'any'),
    'characterApproval': is_bool,
}

# Body: {id, rules}. rules holds only the rules being changed; they merge into the file.
@app.route('/update/campaign-rules', methods=['PUT'])
def update_campaign_rules():
    content = request.get_json()
    rules = content.get('rules')
    if not isinstance(rules, dict) or not rules:
        return jsonify({'error': 'rules must be a non-empty object.'}), 400
    for key, value in rules.items():
        check = RULE_CHECKS.get(key)
        if check is None:
            return jsonify({'error': f'Unknown rule: {key}'}), 400
        if not check(value):
            return jsonify({'error': f'Invalid value for {key}.'}), 400
    campaign_path = campaign_file_path(content.get('id'))
    if campaign_path is None or not os.path.exists(campaign_path):
        return jsonify({'error': 'Campaign not found'}), 404

    with open(campaign_path, 'r') as f:
        details = json.load(f)
    details.setdefault('rules', {}).update(rules)
    with open(campaign_path, 'w') as f:
        json.dump(details, f, indent=4)

    return jsonify({'success': True}), 200

if __name__ == '__main__':
    app.run(port=5174, debug=False)