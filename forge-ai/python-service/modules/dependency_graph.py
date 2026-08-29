import os
import re
from pathlib import Path

IGNORE_DIRS = {'.git', 'node_modules', '__pycache__', 'dist', 'build', '.next',
               'venv', '.venv', 'coverage', '.turbo', '.cache', 'out', '.svelte-kit',
               '.nuxt', 'vendor', 'target', 'bin', 'obj'}

LANG_MAP = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.css': 'css', '.scss': 'css', '.less': 'css',
    '.html': 'html',
}

SOURCE_EXTS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go',
               '.rs', '.java', '.cs', '.rb', '.php', '.vue', '.svelte'}


def extract_imports(file_path: str, content: str) -> list:
    imports = []
    ext = Path(file_path).suffix.lower()

    if ext in {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'}:
        # import X from '...' / import '...'
        for m in re.finditer(r"""(?:import|from)\s+['"]([^'"]+)['"]""", content):
            imports.append(m.group(1))
        # require('...')
        for m in re.finditer(r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)""", content):
            imports.append(m.group(1))
        # dynamic import('...')
        for m in re.finditer(r"""import\s*\(\s*['"]([^'"]+)['"]\s*\)""", content):
            imports.append(m.group(1))
    elif ext == '.py':
        for m in re.finditer(r"""from\s+([\w.]+)\s+import""", content):
            imports.append(m.group(1).replace('.', '/'))
        for m in re.finditer(r"""^import\s+([\w.]+)""", content, re.MULTILINE):
            imports.append(m.group(1).split('.')[0])
    elif ext == '.go':
        in_block = False
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith('import ('):
                in_block = True
                continue
            if in_block and stripped == ')':
                in_block = False
                continue
            if in_block or stripped.startswith('import '):
                m = re.search(r'"([^"]+)"', stripped)
                if m:
                    imports.append(m.group(1))
    elif ext == '.rs':
        for m in re.finditer(r"""use\s+([\w:]+)""", content):
            parts = m.group(1).split('::')
            if parts:
                imports.append(parts[0])

    return imports


def resolve_import(from_file: str, import_path: str, repo_root: str, all_files: set) -> str | None:
    if not (import_path.startswith('.') or import_path.startswith('@/') or import_path.startswith('~/')):
        return None

    if import_path.startswith('.'):
        base_dir = os.path.dirname(os.path.join(repo_root, from_file))
        resolved = os.path.normpath(os.path.join(base_dir, import_path))
    elif import_path.startswith('@/') or import_path.startswith('~/'):
        cleaned = import_path[2:]
        for prefix in ['src/', '']:
            resolved = os.path.normpath(os.path.join(repo_root, prefix + cleaned))
            for ext in ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js']:
                candidate = resolved + ext
                rel = os.path.relpath(candidate, repo_root).replace('\\', '/')
                if rel in all_files:
                    return rel
        return None

    for ext in ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '.py', '.go']:
        candidate = resolved + ext
        try:
            rel = os.path.relpath(candidate, repo_root).replace('\\', '/')
            if rel in all_files:
                return rel
        except ValueError:
            pass

    return None


def build_dependency_graph(repo_path: str) -> dict:
    all_rel_paths: set = set()
    file_data = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
        for fname in files:
            ext = Path(fname).suffix.lower()
            if ext not in SOURCE_EXTS:
                continue
            abs_path = os.path.join(root, fname)
            rel_path = os.path.relpath(abs_path, repo_path).replace('\\', '/')
            all_rel_paths.add(rel_path)
            file_data.append((rel_path, abs_path, ext))

    # Prefer non-test files; cap total to 200
    if len(file_data) > 200:
        non_test = [f for f in file_data
                    if 'test' not in f[0].lower() and 'spec' not in f[0].lower()
                    and '__tests__' not in f[0]]
        test_files = [f for f in file_data if f not in non_test]
        file_data = non_test[:180] + test_files[:20]

    node_ids = {fd[0] for fd in file_data}
    nodes = []
    edges = []

    for rel_path, abs_path, ext in file_data:
        try:
            with open(abs_path, 'r', encoding='utf-8', errors='ignore') as fh:
                content = fh.read(60_000)
        except Exception:
            content = ''

        try:
            size = os.path.getsize(abs_path)
        except Exception:
            size = 0

        nodes.append({
            'id': rel_path,
            'label': os.path.basename(rel_path),
            'language': LANG_MAP.get(ext, 'unknown'),
            'size': size,
            'path': rel_path,
            'dir': os.path.dirname(rel_path) or '.',
        })

        raw_imports = extract_imports(rel_path, content)
        for imp in raw_imports:
            resolved = resolve_import(rel_path, imp, repo_path, all_rel_paths)
            if resolved and resolved in node_ids and resolved != rel_path:
                edges.append({'source': rel_path, 'target': resolved})

    # Deduplicate edges
    seen: set = set()
    unique_edges = []
    for e in edges:
        key = (e['source'], e['target'])
        if key not in seen:
            seen.add(key)
            unique_edges.append(e)

    # Compute in-degree for each node (how many files import it)
    in_degree: dict = {n['id']: 0 for n in nodes}
    for e in unique_edges:
        if e['target'] in in_degree:
            in_degree[e['target']] += 1

    for n in nodes:
        n['inDegree'] = in_degree[n['id']]

    return {'nodes': nodes, 'edges': unique_edges}


def get_impact(repo_path: str, target_file: str) -> dict:
    graph = build_dependency_graph(repo_path)

    # Build reverse adjacency: file → list of files that import it
    reverse: dict = {n['id']: [] for n in graph['nodes']}
    for edge in graph['edges']:
        t = edge['target']
        s = edge['source']
        if t in reverse and s not in reverse[t]:
            reverse[t].append(s)

    # BFS from target_file through reverse graph
    visited: dict = {}
    queue = [(target_file, 0)]
    while queue:
        current, depth = queue.pop(0)
        if current in visited:
            continue
        visited[current] = depth
        for importer in reverse.get(current, []):
            if importer not in visited:
                queue.append((importer, depth + 1))

    visited.pop(target_file, None)

    affected = [
        {'path': p, 'distance': d}
        for p, d in sorted(visited.items(), key=lambda x: x[1])
    ]

    return {
        'targetFile': target_file,
        'affectedCount': len(affected),
        'affected': affected[:60],
        'directImporters': [a['path'] for a in affected if a['distance'] == 1],
    }
