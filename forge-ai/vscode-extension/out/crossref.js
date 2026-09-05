"use strict";
// vscode-extension/src/crossref.ts
// Deterministic cross-file analyzer: runs locally over ALL files, no AI, no token limits.
// Finds: broken import paths, missing exports, param-count mismatches, missing HTML handlers/assets.
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCrossRefs = analyzeCrossRefs;
const JS_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'await', 'import', 'export', 'require', 'super', 'constructor', 'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'parseInt', 'parseFloat', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'alert', 'confirm', 'prompt', 'fetch', 'isNaN', 'Error', 'Date', 'RegExp', 'Map', 'Set', 'Symbol', 'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'push', 'pop', 'map', 'filter', 'forEach', 'reduce', 'join', 'split', 'slice', 'splice', 'indexOf', 'includes', 'replace', 'trim', 'toString', 'toLowerCase', 'toUpperCase', 'then', 'catch', 'finally', 'log', 'warn', 'error', 'stringify', 'parse', 'assign', 'keys', 'values', 'entries', 'freeze', 'random', 'floor', 'ceil', 'round', 'abs', 'min', 'max', 'require']);
function countParams(sig) {
    const parts = sig.split(',').map((p) => p.trim()).filter(Boolean);
    const variadic = parts.some((p) => p.startsWith('...'));
    const withDefault = parts.filter((p) => p.includes('=')).length;
    return { min: parts.length - withDefault - (variadic ? 1 : 0), max: parts.length, variadic };
}
function countArgs(argStr) {
    const s = argStr.trim();
    if (!s)
        return 0;
    // crude: only count when no nested parens/brackets (else skip via -1)
    if (/[(){}\[\]]/.test(s))
        return -1;
    return s.split(',').length;
}
function parseFile(path, content) {
    const info = {
        path, imports: [], exports: new Set(), hasDefaultExport: false,
        defs: new Map(), calls: [], htmlHandlers: [], htmlAssets: [],
    };
    const lines = content.split('\n');
    const ext = '.' + (path.split('.').pop() ?? '');
    if (ext === '.html') {
        lines.forEach((l, i) => {
            let m;
            const onRe = /on\w+\s*=\s*["'](\w+)\s*\(/g;
            while ((m = onRe.exec(l)))
                info.htmlHandlers.push({ name: m[1], line: i + 1 });
            const srcRe = /<(?:script[^>]*src|link[^>]*href|img[^>]*src)\s*=\s*["']([^"']+)["']/g;
            while ((m = srcRe.exec(l))) {
                const src = m[1];
                if (!src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
                    info.htmlAssets.push({ src, line: i + 1 });
                }
            }
        });
        return info;
    }
    if (!JS_EXT.includes(ext))
        return info;
    lines.forEach((l, i) => {
        let m;
        // import default + named
        const impRe = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*(?:([\w$]+)\s*)?from\s*['"]([^'"]+)['"]/g;
        while ((m = impRe.exec(l))) {
            const names = (m[2] ?? '').split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
            info.imports.push({ names, def: m[1] ?? m[3], from: m[4], line: i + 1 });
        }
        // require
        const reqRe = /(?:const|let|var)\s+(?:\{([^}]*)\}|([\w$]+))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((m = reqRe.exec(l))) {
            const names = (m[1] ?? '').split(',').map((n) => n.trim().split(':')[0]).filter(Boolean);
            info.imports.push({ names, def: m[2], from: m[3], line: i + 1 });
        }
        // exports
        const expFn = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([\w$]+)/g;
        while ((m = expFn.exec(l))) {
            info.exports.add(m[1]);
            if (l.includes('default'))
                info.hasDefaultExport = true;
        }
        const expVar = /export\s+(?:const|let|var)\s+([\w$]+)/g;
        while ((m = expVar.exec(l)))
            info.exports.add(m[1]);
        const expList = /export\s*\{([^}]*)\}/g;
        while ((m = expList.exec(l)))
            m[1].split(',').forEach((n) => info.exports.add(n.trim().split(/\s+as\s+/).pop() ?? ''));
        if (/export\s+default/.test(l))
            info.hasDefaultExport = true;
        const modExp = /module\.exports\s*=\s*\{([^}]*)\}/g;
        while ((m = modExp.exec(l)))
            m[1].split(',').forEach((n) => info.exports.add(n.trim().split(':')[0]));
        if (/module\.exports\s*=\s*[\w$]+/.test(l))
            info.hasDefaultExport = true;
        const expDot = /exports\.([\w$]+)\s*=/g;
        while ((m = expDot.exec(l)))
            info.exports.add(m[1]);
        // function definitions (also non-exported — HTML handlers need these)
        const fnRe = /(?:^|\s)(?:async\s+)?function\s+([\w$]+)\s*\(([^)]*)\)/g;
        while ((m = fnRe.exec(l)))
            info.defs.set(m[1], { ...countParams(m[2]), line: i + 1 });
        const arrowRe = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
        while ((m = arrowRe.exec(l)))
            info.defs.set(m[1], { ...countParams(m[2]), line: i + 1 });
        // calls (char before name must not be . or alphanumeric)
        const callRe = /(^|[^.\w$])([\w$]+)\s*\(([^()]*)\)/g;
        while ((m = callRe.exec(l))) {
            const name = m[2];
            if (KEYWORDS.has(name))
                continue;
            const argc = countArgs(m[3]);
            if (argc >= 0)
                info.calls.push({ name, argc, line: i + 1 });
        }
    });
    return info;
}
function resolvePath(fromFile, imp, allPaths) {
    if (!imp.startsWith('.'))
        return 'external'; // npm package — skip
    const dir = fromFile.split('/').slice(0, -1);
    const parts = imp.split('/');
    const stack = [...dir];
    for (const p of parts) {
        if (p === '.')
            continue;
        else if (p === '..')
            stack.pop();
        else
            stack.push(p);
    }
    const base = stack.join('/');
    const candidates = [base, ...JS_EXT.map((e) => base + e), ...JS_EXT.map((e) => base + '/index' + e), base + '.css', base + '.json'];
    for (const c of candidates)
        if (allPaths.has(c))
            return c;
    return null;
}
function analyzeCrossRefs(files) {
    const findings = [];
    const infos = new Map();
    const allPaths = new Set(files.keys());
    for (const [path, content] of files)
        infos.set(path, parseFile(path, content));
    // Global def table: name → {file, sig} (only unique names to avoid false positives)
    const defCount = new Map();
    const defWhere = new Map();
    for (const info of infos.values()) {
        for (const [name, sig] of info.defs) {
            defCount.set(name, (defCount.get(name) ?? 0) + 1);
            defWhere.set(name, { file: info.path, ...sig });
        }
    }
    for (const info of infos.values()) {
        // 1. Import path resolution
        for (const imp of info.imports) {
            const resolved = resolvePath(info.path, imp.from, allPaths);
            if (resolved === 'external')
                continue;
            if (resolved === null) {
                findings.push({
                    severity: 'critical',
                    title: `Broken import path '${imp.from}'`,
                    files: [info.path],
                    description: `${info.path}:${imp.line} imports from '${imp.from}' but no such file exists in the workspace.`,
                    fix_hint: 'Fix the path or create the missing file.',
                });
                continue;
            }
            // 2. Named imports vs actual exports
            const target = infos.get(resolved);
            if (target && JS_EXT.some((e) => resolved.endsWith(e))) {
                for (const name of imp.names) {
                    if (!target.exports.has(name)) {
                        findings.push({
                            severity: 'high',
                            title: `'${name}' is not exported by ${resolved}`,
                            files: [info.path, resolved],
                            description: `${info.path}:${imp.line} imports { ${name} } but ${resolved} exports: ${[...target.exports].join(', ') || '(nothing named)'}.`,
                            fix_hint: `Export '${name}' from ${resolved} or fix the import name.`,
                        });
                    }
                }
                if (imp.def && !target.hasDefaultExport && target.exports.size > 0) {
                    findings.push({
                        severity: 'high',
                        title: `No default export in ${resolved}`,
                        files: [info.path, resolved],
                        description: `${info.path}:${imp.line} uses a default import '${imp.def}' but ${resolved} has no default export.`,
                        fix_hint: `Add 'export default' in ${resolved} or use a named import.`,
                    });
                }
            }
        }
        // 3. Cross-file param mismatches (unique global names only)
        for (const call of info.calls) {
            const def = defWhere.get(call.name);
            if (!def || defCount.get(call.name) !== 1)
                continue;
            if (def.file === info.path)
                continue; // same-file: linters catch these
            if (def.variadic)
                continue;
            if (call.argc < def.min || call.argc > def.max) {
                findings.push({
                    severity: 'high',
                    title: `'${call.name}()' called with ${call.argc} arg(s), defined with ${def.min === def.max ? def.max : `${def.min}-${def.max}`}`,
                    files: [info.path, def.file],
                    description: `Symptom in ${info.path}:${call.line} — cause: ${def.file}:${def.line} defines ${call.name} with ${def.max} parameter(s).`,
                    fix_hint: 'Align the call arguments with the function signature.',
                });
            }
        }
        // 4. HTML handlers must exist in some JS file
        for (const h of info.htmlHandlers) {
            if (!defWhere.has(h.name)) {
                findings.push({
                    severity: 'high',
                    title: `HTML handler '${h.name}()' not defined in any JS file`,
                    files: [info.path],
                    description: `${info.path}:${h.line} wires on-event to '${h.name}' but no JS file defines it.`,
                    fix_hint: `Define function ${h.name}() in a script loaded by this page.`,
                });
            }
        }
        // 5. HTML assets must exist
        for (const a of info.htmlAssets) {
            const resolved = resolvePath(info.path, a.src.startsWith('.') ? a.src : './' + a.src, allPaths);
            if (resolved === null) {
                findings.push({
                    severity: 'medium',
                    title: `Missing asset '${a.src}'`,
                    files: [info.path],
                    description: `${info.path}:${a.line} references '${a.src}' which doesn't exist in the workspace.`,
                    fix_hint: 'Fix the path or add the file.',
                });
            }
        }
    }
    return findings.slice(0, 25);
}
