import * as path from 'node:path';

import * as vscode from 'vscode';

import { openArtifactCommand } from './artifactCommands';
import {
	artifactKinds,
	discoverWorkspaceArtifacts,
	type ArtifactDiscoveryOptions,
	type ArtifactDiscoveryResult,
	type ArtifactGroupDiscoveryResult,
	type ArtifactKind,
	type DiscoveredArtifact,
	type ProjectArtifactDiscoveryResult,
} from './artifactDiscovery';
import { hasHdlProjectsContext } from '../specs/specsTree';

export const artifactsTreeViewId = 'vscode-hdl-dev.artifacts';
export const refreshArtifactsCommand = 'vscode-hdl-dev.refreshArtifacts';

export type ArtifactsTreeNode =
	| ArtifactsTreeProjectNode
	| ArtifactsTreeGroupNode
	| ArtifactsTreeArtifactNode
	| ArtifactsTreeStatusNode;

export interface ArtifactsTreeProjectNode {
	readonly type: 'project';
	readonly projectResult: ProjectArtifactDiscoveryResult;
}

export interface ArtifactsTreeGroupNode {
	readonly type: 'group';
	readonly projectResult: ProjectArtifactDiscoveryResult;
	readonly group: ArtifactGroupDiscoveryResult;
}

export interface ArtifactsTreeArtifactNode {
	readonly type: 'artifact';
	readonly artifact: DiscoveredArtifact;
}

export interface ArtifactsTreeStatusNode {
	readonly type: 'status';
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly contextValue: string;
	readonly severity: 'info' | 'warning' | 'error';
}

type ContextSetter = (key: string, value: boolean) => Thenable<unknown>;

export function registerArtifactsTree(context: vscode.ExtensionContext): void {
	const provider = new ArtifactsTreeDataProvider(
		createWorkspaceArtifactDiscoveryOptions,
		(key, value) => vscode.commands.executeCommand('setContext', key, value),
	);
	const refresh = (): void => {
		void provider.refresh();
	};
	const view = vscode.window.createTreeView(artifactsTreeViewId, {
		treeDataProvider: provider,
		showCollapseAll: true,
	});
	const watcherDisposables = createArtifactFileWatchers(refresh);

	context.subscriptions.push(
		provider,
		view,
		...watcherDisposables,
		vscode.commands.registerCommand(refreshArtifactsCommand, async () => provider.refresh()),
		vscode.workspace.onDidChangeWorkspaceFolders(refresh),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('hdlDev.projectRoots')) {
				refresh();
			}
		}),
	);

	refresh();
}

export class ArtifactsTreeDataProvider implements vscode.TreeDataProvider<ArtifactsTreeNode>, vscode.Disposable {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ArtifactsTreeNode | undefined | null | void>();
	public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
	private result: ArtifactDiscoveryResult | undefined;
	private refreshError: string | undefined;
	private refreshSequence = 0;

	public constructor(
		private readonly optionsProvider: () => ArtifactDiscoveryOptions,
		private readonly setContext: ContextSetter,
	) {}

	public async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;

		try {
			const result = await discoverWorkspaceArtifacts(this.optionsProvider());

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

	public getTreeItem(element: ArtifactsTreeNode): vscode.TreeItem {
		return createArtifactsTreeItem(element);
	}

	public getChildren(element?: ArtifactsTreeNode): vscode.ProviderResult<ArtifactsTreeNode[]> {
		if (element === undefined) {
			return createArtifactsTreeRootNodes(this.result, this.refreshError);
		}

		if (element.type === 'project') {
			return artifactKinds().map((kind) => ({
				type: 'group',
				projectResult: element.projectResult,
				group: element.projectResult.groups[kind],
			}));
		}

		if (element.type === 'group') {
			return createGroupChildren(element.group);
		}

		return [];
	}

	public dispose(): void {
		this.onDidChangeTreeDataEmitter.dispose();
	}
}

export function createArtifactsTreeRootNodes(
	result: ArtifactDiscoveryResult | undefined,
	refreshError?: string,
): ArtifactsTreeNode[] {
	if (refreshError !== undefined) {
		return [{
			type: 'status',
			id: 'hdl-dev.artifacts.status.discovery-error',
			label: 'Unable to discover HDL artifacts',
			description: refreshError,
			contextValue: 'hdlDev.artifacts.status.error',
			severity: 'error',
		}];
	}

	if (result === undefined) {
		return [{
			type: 'status',
			id: 'hdl-dev.artifacts.status.loading',
			label: 'Discovering HDL artifacts',
			contextValue: 'hdlDev.artifacts.status.loading',
			severity: 'info',
		}];
	}

	if (result.projects.length === 0) {
		return [{
			type: 'status',
			id: 'hdl-dev.artifacts.status.no-projects',
			label: 'No HDL projects found',
			description: 'Add a Makefile and spec directory, then refresh.',
			contextValue: 'hdlDev.artifacts.status.empty',
			severity: 'info',
		}];
	}

	return result.projects.map((projectResult) => ({
		type: 'project',
		projectResult,
	}));
}

export function createArtifactsTreeItem(element: ArtifactsTreeNode): vscode.TreeItem {
	if (element.type === 'project') {
		return createProjectTreeItem(element.projectResult);
	}

	if (element.type === 'group') {
		return createGroupTreeItem(element.group);
	}

	if (element.type === 'artifact') {
		return createArtifactTreeItem(element.artifact);
	}

	return createStatusTreeItem(element);
}

function createGroupChildren(group: ArtifactGroupDiscoveryResult): ArtifactsTreeNode[] {
	if (group.artifacts.length > 0) {
		const artifactNodes: ArtifactsTreeNode[] = group.artifacts.map((artifact) => ({
			type: 'artifact',
			artifact,
		}));

		if (group.truncated) {
			artifactNodes.push({
				type: 'status',
				id: `hdl-dev.artifacts.group|${group.kind}|truncated|${group.directoryPath}`,
				label: 'Additional artifacts omitted',
				description: 'Refine the artifact directory before refreshing.',
				contextValue: 'hdlDev.artifacts.status.truncated',
				severity: 'warning',
			});
		}

		return artifactNodes;
	}

	return [{
		type: 'status',
		id: `hdl-dev.artifacts.group|${group.kind}|empty|${group.directoryPath}`,
		label: group.directoryAvailable ? `No ${group.label.toLowerCase()} found` : `${group.label} directory missing`,
		description: group.emptyMessage,
		contextValue: 'hdlDev.artifacts.status.empty',
		severity: 'info',
	}];
}

function createProjectTreeItem(projectResult: ProjectArtifactDiscoveryResult): vscode.TreeItem {
	const project = projectResult.project;
	const item = new vscode.TreeItem(path.basename(project.rootPath), vscode.TreeItemCollapsibleState.Expanded);
	item.id = `hdl-dev.artifacts.project|${project.rootPath}`;
	item.description = project.rootPath;
	item.tooltip = project.rootPath;
	item.contextValue = 'hdlDev.artifacts.project';
	item.resourceUri = vscode.Uri.file(project.rootPath);
	item.iconPath = new vscode.ThemeIcon('root-folder');
	return item;
}

function createGroupTreeItem(group: ArtifactGroupDiscoveryResult): vscode.TreeItem {
	const item = new vscode.TreeItem(group.label, vscode.TreeItemCollapsibleState.Collapsed);
	item.id = `hdl-dev.artifacts.group|${group.kind}|${group.directoryPath}`;
	item.description = `${group.artifacts.length}`;
	item.tooltip = group.directoryAvailable
		? group.directoryPath
		: `${group.directoryPath}\n${group.emptyMessage}`;
	item.contextValue = `hdlDev.artifacts.kind.${group.kind}`;
	item.resourceUri = vscode.Uri.file(group.directoryPath);
	item.iconPath = new vscode.ThemeIcon(iconForGroup(group.kind));
	return item;
}

function createArtifactTreeItem(artifact: DiscoveredArtifact): vscode.TreeItem {
	const item = new vscode.TreeItem(artifact.fileName, vscode.TreeItemCollapsibleState.None);
	item.id = artifact.id;
	item.description = artifact.relativePath;
	item.tooltip = `${artifact.filePath}\n${formatByteSize(artifact.sizeBytes)}`;
	item.contextValue = `hdlDev.artifacts.artifact.${artifact.kind}`;
	item.resourceUri = vscode.Uri.file(artifact.filePath);
	item.command = {
		command: openArtifactCommand,
		title: 'Open Artifact',
		arguments: [artifact],
	};
	item.iconPath = new vscode.ThemeIcon(iconForArtifact(artifact.kind));
	return item;
}

function createStatusTreeItem(node: ArtifactsTreeStatusNode): vscode.TreeItem {
	const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
	item.id = node.id;
	item.description = node.description;
	item.tooltip = node.description ?? node.label;
	item.contextValue = node.contextValue;
	item.iconPath = new vscode.ThemeIcon(statusIconId(node.severity));
	return item;
}

function createArtifactFileWatchers(refresh: () => void): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	for (const pattern of [
		'**/build/waves/*',
		'**/docs/waveforms/generated/*.svg',
		'**/docs/schematics/generated/*.svg',
		'**/build/schematics/**/*',
		'**/logs/**/*',
		'**/build/csv/**/*',
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

function createWorkspaceArtifactDiscoveryOptions(): ArtifactDiscoveryOptions {
	const configuration = vscode.workspace.getConfiguration('hdlDev');

	return {
		workspaceFolderPaths: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
		configuredRootPaths: configuration.get<readonly string[]>('projectRoots', []),
	};
}

function iconForGroup(kind: ArtifactKind): string {
	if (kind === 'waveDump') {
		return 'pulse';
	}

	if (kind === 'waveformSvg' || kind === 'schematicSvg' || kind === 'plot') {
		return 'symbol-color';
	}

	if (kind === 'schematicJson' || kind === 'csv') {
		return 'table';
	}

	return 'output';
}

function iconForArtifact(kind: ArtifactKind): string {
	if (kind === 'waveDump') {
		return 'pulse';
	}

	if (kind === 'waveformSvg' || kind === 'schematicSvg' || kind === 'plot') {
		return 'file-media';
	}

	if (kind === 'schematicJson') {
		return 'file-code';
	}

	if (kind === 'csv') {
		return 'table';
	}

	return 'output';
}

function statusIconId(severity: ArtifactsTreeStatusNode['severity']): string {
	if (severity === 'error') {
		return 'error';
	}

	if (severity === 'warning') {
		return 'warning';
	}

	return 'info';
}

function formatByteSize(sizeBytes: number): string {
	if (sizeBytes < 1024) {
		return `${sizeBytes} B`;
	}

	const kibibytes = sizeBytes / 1024;

	if (kibibytes < 1024) {
		return `${kibibytes.toFixed(1)} KiB`;
	}

	return `${(kibibytes / 1024).toFixed(1)} MiB`;
}

function formatRefreshError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return 'Unknown artifact discovery error.';
}
