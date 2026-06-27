import * as fs from 'node:fs/promises';

import * as vscode from 'vscode';

import type { DiscoveredArtifact } from './artifactDiscovery';
import type { ArtifactsTreeArtifactNode } from './artifactsTree';

export const openArtifactCommand = 'vscode-hdl-dev.openArtifact';
export const revealArtifactCommand = 'vscode-hdl-dev.revealArtifact';
export const copyArtifactPathCommand = 'vscode-hdl-dev.copyArtifactPath';

export interface ArtifactCommandHost {
	artifactExists(filePath: string): Promise<boolean>;
	openArtifact(filePath: string): Thenable<unknown>;
	revealArtifact(filePath: string): Thenable<unknown>;
	copyText(text: string): Thenable<unknown>;
	showErrorMessage(message: string): Thenable<unknown>;
	showInformationMessage(message: string): Thenable<unknown>;
}

type ArtifactCommandTarget =
	| ArtifactsTreeArtifactNode
	| DiscoveredArtifact
	| undefined;

export function registerArtifactCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			openArtifactCommand,
			(target?: ArtifactCommandTarget) => runOpenArtifactCommand(createArtifactCommandHost(), target),
		),
		vscode.commands.registerCommand(
			revealArtifactCommand,
			(target?: ArtifactCommandTarget) => runRevealArtifactCommand(createArtifactCommandHost(), target),
		),
		vscode.commands.registerCommand(
			copyArtifactPathCommand,
			(target?: ArtifactCommandTarget) => runCopyArtifactPathCommand(createArtifactCommandHost(), target),
		),
	);
}

export async function runOpenArtifactCommand(
	host: ArtifactCommandHost,
	target: ArtifactCommandTarget,
): Promise<DiscoveredArtifact | undefined> {
	const artifact = resolveArtifact(target);

	if (artifact === undefined) {
		await host.showErrorMessage('Select an artifact from the Artifacts tree first.');
		return undefined;
	}

	if (!(await ensureArtifactExists(host, artifact))) {
		return undefined;
	}

	await host.openArtifact(artifact.filePath);
	return artifact;
}

export async function runRevealArtifactCommand(
	host: ArtifactCommandHost,
	target: ArtifactCommandTarget,
): Promise<DiscoveredArtifact | undefined> {
	const artifact = resolveArtifact(target);

	if (artifact === undefined) {
		await host.showErrorMessage('Select an artifact from the Artifacts tree first.');
		return undefined;
	}

	if (!(await ensureArtifactExists(host, artifact))) {
		return undefined;
	}

	await host.revealArtifact(artifact.filePath);
	return artifact;
}

export async function runCopyArtifactPathCommand(
	host: ArtifactCommandHost,
	target: ArtifactCommandTarget,
): Promise<DiscoveredArtifact | undefined> {
	const artifact = resolveArtifact(target);

	if (artifact === undefined) {
		await host.showErrorMessage('Select an artifact from the Artifacts tree first.');
		return undefined;
	}

	await host.copyText(artifact.filePath);
	await host.showInformationMessage(`Copied artifact path: ${artifact.filePath}`);
	return artifact;
}

function createArtifactCommandHost(): ArtifactCommandHost {
	return {
		artifactExists: artifactFileExists,
		openArtifact: (filePath) => vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath)),
		revealArtifact: (filePath) => vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath)),
		copyText: (text) => vscode.env.clipboard.writeText(text),
		showErrorMessage: (message) => vscode.window.showErrorMessage(message),
		showInformationMessage: (message) => vscode.window.showInformationMessage(message),
	};
}

function resolveArtifact(target: ArtifactCommandTarget): DiscoveredArtifact | undefined {
	if (target === undefined) {
		return undefined;
	}

	if ('type' in target && target.type === 'artifact') {
		return target.artifact;
	}

	if ('filePath' in target && 'kind' in target) {
		return target;
	}

	return undefined;
}

async function ensureArtifactExists(
	host: ArtifactCommandHost,
	artifact: DiscoveredArtifact,
): Promise<boolean> {
	if (await host.artifactExists(artifact.filePath)) {
		return true;
	}

	await host.showErrorMessage(`Artifact file was not found. Refresh artifacts or regenerate it: ${artifact.filePath}`);
	return false;
}

async function artifactFileExists(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		return stats.isFile();
	} catch {
		return false;
	}
}
