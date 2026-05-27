from flask import Flask, jsonify, request
from flask_cors import CORS
import json

app = Flask(__name__)
CORS(app)

@app.route('/createcampaign', methods=['POST'])
def create_campaign():
    content = request.get_json()
    
    with open('../user.json', 'r') as f:
        data = json.load(f)
        data['campaigns'].append(content)
    
    with open('../user.json', 'w') as f:
        json.dump(data, f, indent=4)
        
    return jsonify(content), 201

if __name__ == '__main__':
    app.run(port=5174, debug=True)