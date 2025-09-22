from flask import Flask, request, jsonify, session
from flask_cors import CORS
import os
import json

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")

# Allow the static site served from localhost:5500 (python http.server)
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]}})

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_USER = {
    "username": "test-user",
    "password": "password",
}


def _user_file(username: str) -> str:
    safe = "".join(c for c in username if c.isalnum() or c in ("-", "_"))
    return os.path.join(DATA_DIR, f"{safe}.json")


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if username == DEFAULT_USER["username"] and password == DEFAULT_USER["password"]:
        session["user"] = username
        return jsonify({"ok": True, "user": {"username": username}})
    return jsonify({"ok": False, "error": "Invalid credentials"}), 401


@app.route("/api/logout", methods=["POST"]) 
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"]) 
def me():
    user = session.get("user")
    if not user:
        return jsonify({"loggedIn": False}), 401
    return jsonify({"loggedIn": True, "user": {"username": user}})


@app.route("/api/state", methods=["GET"]) 
def get_state():
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    path = _user_file(user)
    if not os.path.exists(path):
        return jsonify({"state": None})
    try:
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        state = None
    return jsonify({"state": state})


@app.route("/api/state", methods=["POST"]) 
def save_state():
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    payload = request.get_json(silent=True) or {}
    state = payload.get("state")
    if state is None:
        return jsonify({"error": "Missing 'state'"}), 400
    path = _user_file(user)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
