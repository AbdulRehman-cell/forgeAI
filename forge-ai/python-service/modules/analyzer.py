import os
import subprocess
from typing import Dict, List


def analyze_repository(repo_path: str) -> Dict:
    """
    Universal multi-language analyzer:
    JS / TS / HTML / CSS / Python (MERN ready)
    """

    results = {
        "errors": [],
        "warnings": [],
        "byFile": {}
    }

    files = _get_all_files(repo_path)

    # Run per-file analysis
    for file in files:
        ext = _get_ext(file)

        try:
            if ext in ["js", "jsx", "ts", "tsx"]:
                errs = _analyze_js(file, repo_path)

            elif ext == "html":
                errs = _analyze_html(file)

            elif ext == "css":
                errs = _analyze_css(file)

            elif ext == "py":
                errs = _analyze_python(file)

            else:
                continue

            if errs:
                results["byFile"][file] = errs
                results["errors"].extend(errs)

        except Exception as e:
            results["errors"].append({
                "file": file,
                "error": str(e),
                "type": "analysis-failure"
            })

    results["errorCount"] = len(results["errors"])
    return results


# -----------------------------
# FILE DETECTION
# -----------------------------
def _get_all_files(repo_path: str) -> List[str]:
    ignore = {"node_modules", ".git", "__pycache__", "venv", ".venv"}
    out = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in ignore]

        for f in files:
            out.append(os.path.join(root, f))

    return out


def _get_ext(file: str) -> str:
    return file.split(".")[-1].lower()


# -----------------------------
# JS / TS (REAL ERROR CATCHING)
# -----------------------------
def _analyze_js(file: str, repo_path: str) -> List[dict]:
    try:
        # fallback even if eslint is NOT installed globally
        result = subprocess.run(
            ["npx", "eslint", file, "--format", "json"],
            cwd=repo_path,
            capture_output=True,
            text=True
        )

        if result.stdout:
            import json
            data = json.loads(result.stdout)

            errors = []
            for item in data:
                for msg in item.get("messages", []):
                    errors.append({
                        "file": file,
                        "line": msg.get("line"),
                        "column": msg.get("column"),
                        "message": msg.get("message"),
                        "rule": msg.get("ruleId"),
                        "severity": msg.get("severity"),
                        "type": "eslint"
                    })

            return errors

        return []

    except Exception as e:
        # IMPORTANT: never silently fail
        return [{
            "file": file,
            "error": str(e),
            "type": "eslint-failed"
        }]


# -----------------------------
# HTML CHECK (BASIC BUT RELIABLE)
# -----------------------------
def _analyze_html(file: str) -> List[dict]:
    try:
        with open(file, "r", encoding="utf-8") as f:
            content = f.read()

        errors = []

        if "<html" not in content.lower():
            errors.append({
                "file": file,
                "message": "Missing <html> tag",
                "type": "html-structure"
            })

        if content.count("<div") != content.count("</div"):
            errors.append({
                "file": file,
                "message": "Unmatched <div> tags",
                "type": "html-structure"
            })

        if "<script" in content and "</script>" not in content:
            errors.append({
                "file": file,
                "message": "Unclosed <script> tag",
                "type": "html-structure"
            })

        return errors

    except Exception as e:
        return [{"file": file, "error": str(e), "type": "html-failed"}]


# -----------------------------
# CSS CHECK (BASIC RULES)
# -----------------------------
def _analyze_css(file: str) -> List[dict]:
    try:
        with open(file, "r", encoding="utf-8") as f:
            content = f.read()

        errors = []

        if "{" in content and "}" not in content:
            errors.append({
                "file": file,
                "message": "Missing closing } in CSS",
                "type": "css-structure"
            })

        return errors

    except Exception as e:
        return [{"file": file, "error": str(e), "type": "css-failed"}]


# -----------------------------
# PYTHON ANALYSIS
# -----------------------------
def _analyze_python(file: str) -> List[dict]:
    try:
        result = subprocess.run(
            ["python", "-m", "py_compile", file],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            return [{
                "file": file,
                "message": result.stderr,
                "type": "python-syntax"
            }]

        return []

    except Exception as e:
        return [{"file": file, "error": str(e), "type": "python-failed"}]