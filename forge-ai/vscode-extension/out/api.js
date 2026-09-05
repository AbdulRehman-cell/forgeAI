"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeAIApi = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
/** Strip accidental quotes/whitespace that break the Bearer header */
function cleanToken(t) {
    return (t ?? '').trim().replace(/^["']|["']$/g, '');
}
class ForgeAIApi {
    constructor(_baseURL, _token) {
        // Base URL and token are resolved fresh per-request from settings,
        // so constructor args are optional and only kept for back-compat.
        this.client = axios_1.default.create({ timeout: 60000 });
        // Read settings on EVERY request — immune to activation-order issues
        this.client.interceptors.request.use((config) => {
            const cfg = vscode.workspace.getConfiguration('forgeai');
            const baseURL = (cfg.get('apiUrl') ?? 'http://localhost:4000/api').replace(/\/$/, '');
            const token = cleanToken(cfg.get('token') ?? '');
            config.baseURL = baseURL;
            if (token) {
                config.headers = config.headers ?? {};
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            console.log('[forgeai] →', config.method?.toUpperCase(), config.url, 'token:', token ? `${token.slice(0, 12)}… (len ${token.length})` : 'NONE');
            return config;
        });
    }
    async analyzeFolder(files, diagnostics) {
        const { data } = await this.client.post('/ai/analyze-folder', { files, diagnostics });
        return data;
    }
    async fixFiles(files, issues) {
        const { data } = await this.client.post('/ai/fix-files', { files, issues });
        return data;
    }
    /** Kept for back-compat with the config-change listener; now a no-op
        since every request reads live settings anyway. */
    updateConfig(_baseURL, _token) { }
    async fixFileDeep(file, folderContext, findings, diagnostics) {
        const { data } = await this.client.post('/ai/fix-file-deep', { file, folderContext, findings, diagnostics });
        return data;
    }
    // ── Repo-based (requires imported GitHub repo) ──────────
    async listRepositories() {
        const { data } = await this.client.get('/repositories');
        return data.repositories;
    }
    /** GitHub repos of the connected account (not yet necessarily imported) */
    async listGitHubRepos() {
        const { data } = await this.client.get('/github/repos');
        return data.repositories;
    }
    /** Import a GitHub repo into ForgeAI (starts the clone+index pipeline) */
    async importRepository(payload) {
        const { data } = await this.client.post('/repositories/import', payload);
        return data.repository;
    }
    async getRepository(id) {
        const { data } = await this.client.get(`/repositories/${id}`);
        return data.repository;
    }
    /** Exchange a valid (short-lived) token for a 90-day extension token */
    async getExtensionToken(shortToken) {
        const cfg = vscode.workspace.getConfiguration('forgeai');
        const baseURL = (cfg.get('apiUrl') ?? 'http://localhost:4000/api').replace(/\/$/, '');
        const { data } = await axios_1.default.get(`${baseURL}/auth/extension-token`, {
            headers: { Authorization: `Bearer ${cleanToken(shortToken)}` },
            timeout: 15000,
        });
        return data.token;
    }
    async fixWorkspace(repositoryId) {
        const { data } = await this.client.post('/tasks/fix-workspace', { repositoryId });
        return data.task;
    }
    async fixFile(repositoryId, filePath) {
        const { data } = await this.client.post('/tasks/fix-file', { repositoryId, filePath });
        return data.task;
    }
    async getTask(taskId) {
        const { data } = await this.client.get(`/tasks/${taskId}`);
        return data.task;
    }
    async listTasks(limit = 20) {
        const { data } = await this.client.get(`/tasks?limit=${limit}`);
        return data.tasks;
    }
    async chat(repositoryId, message) {
        const { data } = await this.client.post('/ai/chat', { repositoryId, message });
        return data;
    }
    // ── Local mode (works on ANY file, no repo needed) ──────
    async fixCode(code, fileName) {
        const { data } = await this.client.post('/ai/fix-code', { code, fileName });
        return data.fixed;
    }
    async explainCode(code, fileName) {
        const { data } = await this.client.post('/ai/explain-code', { code, fileName });
        return data.explanation;
    }
}
exports.ForgeAIApi = ForgeAIApi;
