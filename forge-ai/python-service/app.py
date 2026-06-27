from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

from modules.indexer import index_repository
from modules.file_tree import get_file_tree
from modules.context_builder import build_context
from modules.analyzer import analyze_repository

load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── Health ───────────────────────────────────────────────
@app.get("/health")
def health():
    return jsonify({"status": "ok"})

# ─── Index repository ─────────────────────────────────────
@app.post("/repo/index")
def index_repo():
    data = request.get_json()
    repo_path = data.get("path")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    result = index_repository(repo_path)
    return jsonify(result)

# ─── File tree ────────────────────────────────────────────
@app.get("/repo/tree")
def file_tree():
    repo_path = request.args.get("path")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    tree = get_file_tree(repo_path)
    return jsonify({"tree": tree})

# ─── Context builder ──────────────────────────────────────
@app.post("/repo/context")
def repo_context():
    data = request.get_json()
    repo_path = data.get("path")
    query = data.get("query", "")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    context = build_context(repo_path, query)
    return jsonify({"context": context})

# ─── Static analysis / build runner ──────────────────────
@app.post("/analyze")
def analyze():
    data = request.get_json()
    repo_path = data.get("path")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    result = analyze_repository(repo_path)
    return jsonify(result)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
