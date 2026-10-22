from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import re, uuid

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
USER_JSON_URL = os.path.join(PUBLIC_DIR, 'user.json')
CAMPAIGNS_FOLDER_URL = os.path.join(PUBLIC_DIR, '.campaigns') + os.sep

def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = ' '.join(raw.split())
    if not 1 <= len(name) <= 60 or re.search(r'[\x00-\x1f\x7f]', name):
        return None
    return name

def valid_id(raw):
    try:
        return str(uuid.UUID(raw)) == raw
    except (ValueError, TypeError, AttributeError):
        return False

app = Flask(__name__)
CORS(app)

@app.route('/createcampaign', methods=['POST'])
def create_campaign():
    content = request.get_json()
    campaign_id = content.get('id')
    campaign_name = content.get('name')
        
    with open(CAMPAIGNS_FOLDER_URL + campaign_id + '.json', 'w') as f:
        details = {
            "name": campaign_name,
            "description": None,
            "characters": None,
            "alternate-rules": None
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
        return jsonify({'error': 'Name must be 1–60 characters.'}), 400
    if not valid_id(campaign_id):
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
    
    with open(CAMPAIGNS_FOLDER_URL + campaign_id + '.json', 'r') as f:
        details = json.load(f)
        
    details['name'] = new_name
    
    with open(CAMPAIGNS_FOLDER_URL + campaign_id + '.json', 'w') as f:
        json.dump(details, f, indent=4)

    return jsonify({'success': True, 'campaign': campaign}), 200

if __name__ == '__main__':
    app.run(port=5174, debug=True)