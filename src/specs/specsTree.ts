import * as path from 'node:path';

import * as vscode from 'vscode';

import {
	discoverWorkspaceSpecs,
	type DiscoveredSpec,
	type ProjectSpecDiscoveryResult,
	type SpecDiscoveryOptions,
	type SpecDiscoveryResult,
	type SpecKind,
} from './specDiscovery';

export const specsTreeViewId = 'vscode-hdl-dev.specs';
export const refreshSpecsCommand = 'vscode-hdl-dev.refreshSpecs';
export const hasHdlProjectsContext = 'hdlDev.hasProjects';

export type SpecsTreeNode =
	| SpecsTreeProjectNode
	| SpecsTreeKindNode
	| SpecsTreeSpecNode
	| SpecsTreeStatusNode;

export interface SpecsTreeProjectNode {
	readonly type: 'project';
	readonly projectResult: ProjectSpecDiscoveryResult;
}

export interface SpecsTreeKindNode {
	readonly type: 'kind';
	readonly projectResult: ProjectSpecDiscoveryResult;
	readonly kind: SpecKind;
}

export interface SpecsTreeSpecNode {
	readonly type: 'spec';
	readonly spec: DiscoveredSpec;
}

export interface SpecsTreeStatusNode {
	readonly type: 'status';
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly contextValue: string;
	readonly severity: 'info' | 'warning' | 'error';
}

type ContextSetter = (key: string, value: boolean) => Thenable<unknown>;

export function registerSpecsTree(context: vscode.ExtensionContext): void {
	const provider = new SpecsTreeDataProvider(
		createWorkspaceSpecDiscoveryOptions,
		(key, value) => vscode.commands.executeCommand('setContext', key, value),
	);
	const refresh = (): void => {
		void provider.refresh();
	};
	const view = vscode.window.createTreeView(specsTreeViewId, {
		treeDataProvider: provider,
		showCollapseAll: true,
	});
	const watcherDisposables = createSpecFileWatchers(refresh);

	context.subscriptions.push(
		provider,
		view,
		...watcherDisposables,
		vscode.commands.registerCommand(refreshSpecsCommand, async () => provider.refresh()),
		vscode.workspace.onDidChangeWorkspaceFolders(refresh),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('hdlDev.projectRoots')) {
				refresh();
			}
		}),
	);

	refresh();
}

export class SpecsTreeDataProvider implements vscode.TreeDataProvider<SpecsTreeNode>, vscode.Disposable {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SpecsTreeNode | undefined | null | void>();
	public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
	private result: SpecDiscoveryResult | undefined;
	private refreshError: string | undefined;
	private refreshSequence = 0;

	public constructor(
		private readonly optionsProvider: () => SpecDiscoveryOptions,
		private readonly setContext: ContextSetter,
	) {}

	public async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;

		try {
			const result = await discoverWorkspaceSpecs(this.optionsProvider());

			if (sequence !== this.refreshSequence) {
				return;
			}

			this.result = result;
			this.refreshError = undefined;
			await this.setContext(hasHdlProjectsContext, result.projects.length > 0);
		} catch (error) {
			if (sequence !== this.refreshSequence) {
				return;
			}

			this.result = undefined;
			this.refreshError = formatRefreshError(error);
			await this.setContext(hasHdlProjectsContext, false);
		} finally {
			if (sequence === this.refreshSequence) {
				this.onDidChangeTreeDataEmitter.fire();
			}
		}
	}

	public getTreeItem(element: SpecsTreeNode): vscode.TreeItem {
		return createSpecsTreeItem(element);
	}

	public getChildren(element?: SpecsTreeNode): vscode.ProviderResult<SpecsTreeNode[]> {
		if (element === undefined) {
			return createSpecsTreeRootNodes(this.result, this.refreshError);
		}

		if (element.type === 'project') {
			return createProjectChildren(element.projectResult);
		}

		if (element.type === 'kind') {
			return createKindChildren(element.projectResult, element.kind);
		}

		return [];
	}

	public dispose(): void {
		this.onDidChangeTreeDataEmitter.dispose();
	}
}

export function createSpecsTreeRootNodes(
	result: SpecDiscoveryResult | undefined,
	refreshError?: string,
): SpecsTreeNode[] {
	if (refreshError !== undefined) {
		return [{
			type: 'status',
			id: 'hdl-dev.specs.status.discovery-error',
			label: 'Unable to discover HDL specs',
			description: refreshError,
			contextValue: 'hdlDev.specs.status.error',
			severity: 'error',
		}];
	}

	if (result === undefined) {
		return [{
			type: 'status',
			id: 'hdl-dev.specs.status.loading',
			label: 'Discovering HDL specs',
			contextValue: 'hdlDev.specs.status.loading',
			severity: 'info',
		}];
	}

	if (result.projects.length === 0) {
		return [{
			type: 'status',
			id: 'hdl-dev.specs.status.no-projects',
			label: 'No HDL projects found',
			description: 'Add a Makefile and spec directory, then refresh.',
			contextValue: 'hdlDev.specs.status.empty',
			severity: 'info',
		}];
	}

	return result.projects.map((projectResult) => ({
		type: 'project',
		projectResult,
	}));
}

export function createSpecsTreeItem(element: SpecsTreeNode): vscode.TreeItem {
	if (element.type === 'project') {
		return createProjectTreeItem(element.projectResult);
	}

	if (element.type === 'kind') {
		return createKindTreeItem(element.projectResult, element.kind);
	}

	if (element.type === 'spec') {
		return createSpecTreeItem(element.spec);
	}

	return createStatusTreeItem(element);
}

function createProjectChildren(projectResult: ProjectSpecDiscoveryResult): SpecsTreeNode[] {
	const children: SpecsTreeNode[] = [];

	if (projectResult.project.specs.waveform.available) {
		children.push({
			type: 'kind',
			projectResult,
			kind: 'waveform',
		});
	}

	if (projectResult.project.specs.schematic.available) {
		children.push({
			type: 'kind',
			projectResult,
			kind: 'schematic',
		});
	}

	if (children.length === 0) {
		children.push({
			type: 'status',
			id: `${createProjectNodeId(projectResult.project.rootPath)}|empty`,
			label: 'No spec directories found',
			description: 'Expected docs/waveforms/specs or docs/schematics/specs.',
			contextValue: 'hdlDev.specs.status.empty',
			severity: 'info',
		});
	}

	return children;
}

function createKindChildren(
	projectResult: ProjectSpecDiscoveryResult,
	kind: SpecKind,
): SpecsTreeNode[] {
	const specs = projectResult.specs[kind];

	if (specs.length > 0) {
		return specs.map((spec) => ({
			type: 'spec',
			spec,
		}));
	}

	return [{
		type: 'status',
		id: `${createKindNodeId(projectResult.project.rootPath, kind)}|empty`,
		label: `No ${formatKindLabel(kind).toLowerCase()} JSON files found`,
		description: 'Create a .json file in this spec directory, then refresh.',
		contextValue: 'hdlDev.specs.status.empty',
		severity: 'info',
	}];
}

function createProjectTreeItem(projectResult: ProjectSpecDiscoveryResult): vscode.TreeItem {
	const project = projectResult.project;
	const item = new vscode.TreeItem(path.basename(project.rootPath), vscode.TreeItemCollapsibleState.Expanded);
	item.id = createProjectNodeId(project.rootPath);
	item.description = project.rootPath;
	item.tooltip = project.rootPath;
	item.contextValue = 'hdlDev.specs.project';
	item.resourceUri = vscode.Uri.file(project.rootPath);
	item.iconPath = new vscode.ThemeIcon('root-folder');
	return item;
}

function createKindTreeItem(
	projectResult: ProjectSpecDiscoveryResult,
	kind: SpecKind,
): vscode.TreeItem {
	const specs = projectResult.specs[kind];
	const item = new vscode.TreeItem(`${formatKindLabel(kind)} Specs`, vscode.TreeItemCollapsibleState.Expanded);
	item.id = createKindNodeId(projectResult.project.rootPath, kind);
	item.description = `${specs.length}`;
	item.tooltip = `${formatKindLabel(kind)} specs in ${projectResult.project.rootPath}`;
	item.contextValue = `hdlDev.specs.kind.${kind}`;
	item.iconPath = new vscode.ThemeIcon('folder');
	return item;
}

function createSpecTreeItem(spec: DiscoveredSpec): vscode.TreeItem {
	const item = new vscode.TreeItem(spec.fileName, vscode.TreeItemCollapsibleState.None);
	item.id = spec.id;
	item.description = spec.status === 'valid' ? spec.relativePath : 'Invalid JSON';
	item.tooltip = spec.status === 'valid'
		? spec.filePath
		: `${spec.filePath}\n${spec.errorMessage ?? 'Invalid JSON'}`;
	item.contextValue = `hdlDev.specs.spec.${spec.kind}.${spec.status}`;
	item.resourceUri = vscode.Uri.file(spec.filePath);
	item.command = {
		command: 'vscode.open',
		title: 'Open Spec',
		arguments: [vscode.Uri.file(spec.filePath)],
	};
	item.iconPath = spec.status === 'valid'
		? new vscode.ThemeIcon('file-code')
		: new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
	return item;
}

function createStatusTreeItem(node: SpecsTreeStatusNode): vscode.TreeItem {
	const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
	item.id = node.id;
	item.description = node.description;
	item.tooltip = node.description ?? node.label;
	item.contextValue = node.contextValue;
	item.iconPath = new vscode.ThemeIcon(statusIconId(node.severity));
	return item;
}

function createSpecFileWatchers(refresh: () => void): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	for (const pattern of [
		'**/docs/waveforms/specs/*.json',
		'**/docs/schematics/specs/*.json',
	]) {
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);
		disposables.push(
			watcher,
			watcher.onDidCreate(refresh),
			watcher.onDidChange(refresh),
			watcher.onDidDelete(refresh),
		);
	}

	return disposables;
}

function createWorkspaceSpecDiscoveryOptions(): SpecDiscoveryOptions {
	const configuration = vscode.workspace.getConfiguration('hdlDev');

	return {
		workspaceFolderPaths: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
		configuredRootPaths: configuration.get<readonly string[]>('projectRoots', []),
	};
}

function createProjectNodeId(projectRootPath: string): string {
	return `hdl-dev.specs.project|${projectRootPath}`;
}

function createKindNodeId(projectRootPath: string, kind: SpecKind): string {
	return `hdl-dev.specs.kind|${projectRootPath}|${kind}`;
}

function formatKindLabel(kind: SpecKind): string {
	return kind === 'waveform' ? 'Waveform' : 'Schematic';
}

function statusIconId(severity: SpecsTreeStatusNode['severity']): string {
	if (severity === 'error') {
		return 'error';
	}

	if (severity === 'warning') {
		return 'warning';
	}

	return 'info';
}

function formatRefreshError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return 'Unknown spec discovery error.';
}
