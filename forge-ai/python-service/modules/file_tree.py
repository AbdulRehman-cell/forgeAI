import os

IGNORE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".nuxt", "coverage", ".cache", ".idea", ".vscode",
}

IGNORE_EXTENSIONS = {
    ".lock", ".log", ".map", ".min.js", ".min.css",
}

MAX_DEPTH = 8


def get_file_tree(root: str, depth: int = 0) -> list:
    if depth > MAX_DEPTH:
        return []

    entries = []
    try:
        items = sorted(os.scandir(root), key=lambda e: (e.is_file(), e.name.lower()))
    except PermissionError:
        return []

    for item in items:
        if item.name.startswith(".") and item.name not in {".env.example"}:
            continue
        if item.is_dir() and item.name in IGNORE_DIRS:
            continue
        _, ext = os.path.splitext(item.name)
        if ext in IGNORE_EXTENSIONS:
            continue

        rel_path = os.path.relpath(item.path, root)

        if item.is_dir():
            children = get_file_tree(item.path, depth + 1)
            entries.append({
                "name": item.name,
                "path": rel_path,
                "type": "directory",
                "children": children,
            })
        else:
            entries.append({
                "name": item.name,
                "path": rel_path,
                "type": "file",
                "size": item.stat().st_size,
                "language": _detect_language(item.name),
            })

    return entries


def _detect_language(filename: str) -> str:
    ext_map = {
        ".ts": "TypeScript", ".tsx": "TypeScript",
        ".js": "JavaScript", ".jsx": "JavaScript",
        ".py": "Python", ".rs": "Rust",
        ".go": "Go", ".java": "Java",
        ".cpp": "C++", ".c": "C",
        ".cs": "C#", ".rb": "Ruby",
        ".php": "PHP", ".swift": "Swift",
        ".kt": "Kotlin", ".md": "Markdown",
        ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
        ".toml": "TOML", ".css": "CSS", ".scss": "SCSS",
        ".html": "HTML", ".sh": "Shell",
    }
    _, ext = os.path.splitext(filename)
    return ext_map.get(ext.lower(), "Unknown")
