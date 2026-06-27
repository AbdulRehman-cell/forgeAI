import os
import subprocess
import json


def analyze_repository(repo_path: str) -> dict:
    """Run all available static analysis tools and collect errors."""
    errors = []
    warnings = []

    errors += _run_typescript_check(repo_path)
    errors += _run_eslint(repo_path)
    errors += _run_pylint(repo_path)
    errors += _run_pytest(repo_path)

    return {
        "errors": errors,
        "warnings": warnings,
        "errorCount": len(errors),
    }


def _run_typescript_check(repo_path: str) -> list:
    tsconfig = os.path.join(repo_path, "tsconfig.json")
    if not os.path.exists(tsconfig):
        return []
    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            lines = result.stdout.strip().splitlines() + result.stderr.strip().splitlines()
            return [l for l in lines if l.strip()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


def _run_eslint(repo_path: str) -> list:
    pkg = os.path.join(repo_path, "package.json")
    if not os.path.exists(pkg):
        return []
    eslint_bin = os.path.join(repo_path, "node_modules", ".bin", "eslint")
    if not os.path.exists(eslint_bin):
        return []
    try:
        result = subprocess.run(
            [eslint_bin, ".", "--ext", ".ts,.tsx,.js,.jsx", "--format", "compact", "--max-warnings", "0"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            return [l for l in result.stdout.splitlines() if l.strip()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


def _run_pylint(repo_path: str) -> list:
    py_files = _find_py_files(repo_path)
    if not py_files:
        return []
    try:
        result = subprocess.run(
            ["pylint", "--output-format=text", "--score=no"] + py_files[:20],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            return [l for l in result.stdout.splitlines() if l.strip() and not l.startswith("*")]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


def _run_pytest(repo_path: str) -> list:
    if not _find_py_files(repo_path):
        return []
    try:
        result = subprocess.run(
            ["pytest", "--tb=short", "-q", "--no-header"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            lines = result.stdout.strip().splitlines()
            # Only return failure lines, skip dots/passing output
            return [l for l in lines if "FAILED" in l or "ERROR" in l or "error" in l.lower()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


def _find_py_files(repo_path: str) -> list:
    ignore = {"__pycache__", ".venv", "venv", ".git"}
    results = []
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in ignore]
        for f in files:
            if f.endswith(".py"):
                results.append(os.path.join(root, f))
    return results
