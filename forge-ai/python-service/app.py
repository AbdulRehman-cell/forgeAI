from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

from modules.indexer import index_repository
from modules.file_tree import get_file_tree
from modules.context_builder import build_context
from modules.analyzer import analyze_repository
from modules.dependency_graph import build_dependency_graph, get_impact

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

# ─── Dependency Graph ─────────────────────────────────────
@app.post("/repo/dependencies")
def repo_dependencies():
    data = request.get_json()
    repo_path = data.get("path")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    graph = build_dependency_graph(repo_path)
    return jsonify(graph)

# ─── Impact analysis ──────────────────────────────────────
@app.post("/repo/impact")
def repo_impact():
    data = request.get_json()
    repo_path = data.get("path")
    target_file = data.get("file")
    if not repo_path or not os.path.isdir(repo_path):
        return jsonify({"error": "Invalid path"}), 400
    if not target_file:
        return jsonify({"error": "file parameter required"}), 400
    result = get_impact(repo_path, target_file)
    return jsonify(result)

# ─── Cross-repo code search ────────────────────────────────
@app.post("/repo/search")
def repo_search():
    data = request.get_json()
    repo_path = data.get("path")
    query = (data.get("query") or "").strip().lower()
    if not repo_path or not os.path.isdir(repo_path) or not query:
        return jsonify({"error": "path and query required"}), 400

    IGNORE = {'.git', 'node_modules', '__pycache__', 'dist', 'build', '.next',
              'venv', '.venv', 'coverage', '.turbo', 'out'}
    SRC_EXT = {'.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
               '.cs', '.rb', '.php', '.vue', '.svelte', '.mjs'}
    results = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE and not d.startswith('.')]
        for fname in files:
            if len(results) >= 80:
                break
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SRC_EXT:
                continue
            abs_path = os.path.join(root, fname)
            rel_path = os.path.relpath(abs_path, repo_path).replace('\\', '/')
            try:
                with open(abs_path, 'r', encoding='utf-8', errors='ignore') as fh:
                    lines = fh.read(200_000).splitlines()
            except Exception:
                continue
            for i, line in enumerate(lines):
                if query in line.lower():
                    results.append({
                        'file': rel_path,
                        'line': i + 1,
                        'snippet': line.strip()[:200],
                    })
                    if len(results) >= 80:
                        break

    return jsonify({'results': results, 'query': query})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
