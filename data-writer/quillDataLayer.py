from flask import Flask, jsonify, request
from flask_cors import CORS
import json

USER_JSON_URL = '../public/user.json'

app = Flask(__name__)
CORS(app)

@app.route('/createcampaign', methods=['POST'])
def create_campaign():
    content = request.get_json()
    
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
    
    with open(USER_JSON_URL, 'r') as f:
        data = json.load(f)
    
    campaign = next((c for c in data['campaigns'] if c['id'] == campaign_id), None)

    if not campaign:
        return jsonify({'error': 'Campaign not found'}), 404

    campaign['name'] = new_name

    with open(USER_JSON_URL, 'w') as f:
        json.dump(data, f, indent=4)

    return jsonify({'success': True, 'campaign': campaign}), 200

if __name__ == '__main__':
    app.run(port=5174, debug=True)