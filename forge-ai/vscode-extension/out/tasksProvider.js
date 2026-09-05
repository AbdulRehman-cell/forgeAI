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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksProvider = void 0;
const vscode = __importStar(require("vscode"));
class TasksProvider {
    constructor(api) {
        this.api = api;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // Auto-refresh every 10s
        setInterval(() => this.refresh(), 10000);
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        try {
            const tasks = await this.api['client'].get('/tasks?limit=20').then((r) => r.data.tasks);
            return tasks.map((t) => new TaskItem(t));
        }
        catch {
            return [new TaskItem({ type: 'error', status: 'failed', _id: '0', createdAt: new Date().toISOString() })];
        }
    }
}
exports.TasksProvider = TasksProvider;
class TaskItem extends vscode.TreeItem {
    constructor(task) {
        const label = task.type === 'error'
            ? 'Could not connect to ForgeAI'
            : `${task.type.replace(/_/g, ' ')} — ${task.status}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        const iconMap = {
            completed: 'check',
            failed: 'error',
            running: 'sync~spin',
            pending: 'clock',
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[task.status] ?? 'circle-outline');
        this.description = task.createdAt ? new Date(task.createdAt).toLocaleString() : '';
        this.tooltip = task.summary ?? task.error ?? task.status;
    }
}
