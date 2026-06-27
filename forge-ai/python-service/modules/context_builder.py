import os
import re

IGNORE_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
MAX_CONTEXT_CHARS = 80_000
MAX_FILE_CHARS = 8_000


def build_context(repo_path: str, query: str = "") -> str:
    """
    Build a focused context string from the repository.
    Prioritises files relevant to the query, then README + package manifests.
    """
    sections: list[tuple[int, str]] = []  # (priority, content)

    # Always include README
    for name in ("README.md", "README.txt", "README"):
        p = os.path.join(repo_path, name)
        if os.path.exists(p):
            content = _read_truncated(p)
            sections.append((0, f"## {name}\n{content}"))
            break

    # Package manifest
    for name in ("package.json", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml"):
        p = os.path.join(repo_path, name)
        if os.path.exists(p):
            content = _read_truncated(p, max_chars=3000)
            sections.append((1, f"## {name}\n{content}"))
            break

    # Directory structure summary
    sections.append((2, f"## Directory Structure\n{_dir_summary(repo_path)}"))

    # Source files — scored by relevance to query
    scored_files = []
    query_tokens = set(re.findall(r"\w+", query.lower())) if query else set()

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
        for filename in files:
            _, ext = os.path.splitext(filename)
            if ext.lower() not in {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"}:
                continue
            filepath = os.path.join(root, filename)
            rel = os.path.relpath(filepath, repo_path)
            score = _score_file(rel, filepath, query_tokens)
            scored_files.append((score, filepath, rel))

    scored_files.sort(reverse=True)

    total = sum(len(s) for _, s in sections)
    for _, filepath, rel in scored_files[:30]:
        if total >= MAX_CONTEXT_CHARS:
            break
        content = _read_truncated(filepath)
        block = f"## File: {rel}\n```\n{content}\n```\n"
        sections.append((3, block))
        total += len(block)

    return "\n\n".join(s for _, s in sections)


def _score_file(rel_path: str, filepath: str, query_tokens: set) -> float:
    score = 0.0

    # Boost entry points
    name = os.path.basename(rel_path).lower()
    if name in {"index.ts", "index.js", "main.ts", "main.py", "app.ts", "app.py", "app.js"}:
        score += 10

    # Relevance to query
    if query_tokens:
        path_tokens = set(re.findall(r"\w+", rel_path.lower()))
        overlap = len(query_tokens & path_tokens)
        score += overlap * 3

        try:
            with open(filepath, errors="ignore") as f:
                content_lower = f.read(5000).lower()
            content_tokens = set(re.findall(r"\w+", content_lower))
            score += len(query_tokens & content_tokens)
        except OSError:
            pass

    # Penalise deep paths and tests
    depth = rel_path.count(os.sep)
    score -= depth * 0.5
    if "test" in rel_path.lower() or "spec" in rel_path.lower():
        score -= 2

    return score


def _read_truncated(path: str, max_chars: int = MAX_FILE_CHARS) -> str:
    try:
        with open(path, errors="ignore") as f:
            content = f.read(max_chars)
        if len(content) == max_chars:
            content += "\n... [truncated]"
        return content
    except OSError:
        return ""


def _dir_summary(root: str, depth: int = 0, max_depth: int = 3) -> str:
    if depth > max_depth:
        return ""
    lines = []
    try:
        entries = sorted(os.scandir(root), key=lambda e: (e.is_file(), e.name))
    except PermissionError:
        return ""
    for entry in entries:
        if entry.name.startswith(".") or entry.name in {"node_modules", "__pycache__", "dist", "build"}:
            continue
        indent = "  " * depth
        if entry.is_dir():
            lines.append(f"{indent}{entry.name}/")
            lines.append(_dir_summary(entry.path, depth + 1, max_depth))
        else:
            lines.append(f"{indent}{entry.name}")
    return "\n".join(l for l in lines if l)
