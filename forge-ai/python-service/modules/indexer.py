import os
import json

INDEXABLE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
    ".java", ".cpp", ".c", ".cs", ".rb", ".php", ".swift",
    ".kt", ".md", ".json", ".yaml", ".yml", ".toml",
    ".css", ".scss", ".html", ".sh",
}

IGNORE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", "coverage",
}

MAX_FILE_SIZE = 500_000  # 500KB


def index_repository(repo_path: str) -> dict:
    files = []
    total_size = 0

    for root, dirs, filenames in os.walk(repo_path):
        # Prune ignored dirs in-place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]

        for filename in filenames:
            _, ext = os.path.splitext(filename)
            if ext.lower() not in INDEXABLE_EXTENSIONS:
                continue

            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, repo_path)

            try:
                size = os.path.getsize(filepath)
                if size > MAX_FILE_SIZE:
                    continue
                total_size += size
                files.append({
                    "path": rel_path,
                    "size": size,
                    "extension": ext.lower(),
                })
            except OSError:
                continue

    # Detect framework / stack
    framework = _detect_framework(repo_path)
    dependencies = _extract_dependencies(repo_path)

    return {
        "fileCount": len(files),
        "totalSize": total_size,
        "files": files,
        "framework": framework,
        "dependencies": dependencies,
    }


def _detect_framework(repo_path: str) -> str:
    indicators = {
        "package.json": _check_npm_framework,
        "requirements.txt": lambda p: "Python/Flask or Django",
        "Cargo.toml": lambda p: "Rust",
        "go.mod": lambda p: "Go",
        "pom.xml": lambda p: "Java/Maven",
        "build.gradle": lambda p: "Java/Gradle",
    }
    for filename, detector in indicators.items():
        full = os.path.join(repo_path, filename)
        if os.path.exists(full):
            return detector(full)
    return "Unknown"


def _check_npm_framework(pkg_path: str) -> str:
    try:
        with open(pkg_path) as f:
            pkg = json.load(f)
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "next" in deps:
            return "Next.js"
        if "react" in deps:
            return "React"
        if "vue" in deps:
            return "Vue"
        if "express" in deps:
            return "Express"
        return "Node.js"
    except Exception:
        return "Node.js"


def _extract_dependencies(repo_path: str) -> list:
    pkg_path = os.path.join(repo_path, "package.json")
    req_path = os.path.join(repo_path, "requirements.txt")
    deps = []

    if os.path.exists(pkg_path):
        try:
            with open(pkg_path) as f:
                pkg = json.load(f)
            all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            deps = list(all_deps.keys())[:50]
        except Exception:
            pass
    elif os.path.exists(req_path):
        try:
            with open(req_path) as f:
                deps = [line.split("==")[0].strip() for line in f if line.strip() and not line.startswith("#")]
        except Exception:
            pass

    return deps
