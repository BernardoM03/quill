# Development server: python -m server (npm run dev starts it alongside Vite).
from server.wsgi import app

app.run(port=5174, debug=False)
