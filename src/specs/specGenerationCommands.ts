import * as vscode from 'vscode';

import {
	SpecGenerationService,
	type SpecGenerationMode,
	type SpecGenerationOutput,
	type SpecGenerationResult,
} from './specGeneration';
import type { DiscoveredSpec } from './specDiscovery';
import type { SpecsTreeSpecNode } from './specsTree';

export const generateWaveformSvgCommand = 'vscode-hdl-dev.generateWaveformSvg';
export const generateWaveformSvgNoRunCommand = 'vscode-hdl-dev.generateWaveformSvgNoRun';
export const generateSchematicSvgCommand = 'vscode-hdl-dev.generateSchematicSvg';

export interface SpecGenerationCommandHost {
	readonly workspaceTrusted: boolean;
	readonly output: SpecGenerationOutput;
	readonly service: SpecGenerationService;
	readonly makeExecutable: string;
	readonly environmentOverrides: NodeJS.ProcessEnv;
	openGeneratedSvg(artifactPath: string): Thenable<unknown>;
	showErrorMessage(message: string): Thenable<unknown>;
	showInformationMessage(message: string): Thenable<unknown>;
}

export function registerSpecGenerationCommands(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): void {
	const service = new SpecGenerationService();
	const createHost = (): SpecGenerationCommandHost => {
		const configuration = vscode.workspace.getConfiguration('hdlDev');
		const toolchainRoot = configuration.get<string>('toolchainRoot', '').trim();

		return {
			workspaceTrusted: vscode.workspace.isTrusted,
			output: outputChannel,
			service,
			makeExecutable: configuration.get<string>('makeExecutable', 'make'),
			environmentOverrides: toolchainRoot === '' ? {} : { GHDL_TOOLCHAIN_ROOT: toolchainRoot },
			openGeneratedSvg: (artifactPath) => vscode.commands.executeCommand('vscode.open', vscode.Uri.file(artifactPath)),
			showErrorMessage: (message) => vscode.window.showErrorMessage(message),
			showInformationMessage: (message) => vscode.window.showInformationMessage(message),
		};
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			generateWaveformSvgCommand,
			(node?: SpecsTreeSpecNode) => runSpecGenerationCommand(createHost(), 'waveform', node),
		),
		vscode.commands.registerCommand(
			generateWaveformSvgNoRunCommand,
			(node?: SpecsTreeSpecNode) => runSpecGenerationCommand(createHost(), 'waveformNoRun', node),
		),
		vscode.commands.registerCommand(
			generateSchematicSvgCommand,
			(node?: SpecsTreeSpecNode) => runSpecGenerationCommand(createHost(), 'schematic', node),
		),
	);
}

export async function runSpecGenerationCommand(
	host: SpecGenerationCommandHost,
	mode: SpecGenerationMode,
	node: SpecsTreeSpecNode | DiscoveredSpec | undefined,
): Promise<SpecGenerationResult | undefined> {
	const spec = resolveSpec(node);

	if (spec === undefined) {
		await host.showErrorMessage('Select a waveform or schematic spec from the Specs tree first.');
		return undefined;
	}

	const result = await host.service.generateSpecSvg({
		spec,
		mode,
	}, {
		workspaceTrusted: host.workspaceTrusted,
		makeExecutable: host.makeExecutable,
		environmentOverrides: host.environmentOverrides,
		output: host.output,
	});

	if (result.outcome === 'generated') {
		await host.openGeneratedSvg(result.artifactPath);
		await host.showInformationMessage(result.message);
	} else if (result.outcome !== 'cancelled') {
		await host.showErrorMessage(result.message);
	}

	return result;
}

function resolveSpec(
	node: SpecsTreeSpecNode | DiscoveredSpec | undefined,
): DiscoveredSpec | undefined {
	if (node === undefined) {
		return undefined;
	}

	if ('type' in node && node.type === 'spec') {
		return node.spec;
	}

	if ('kind' in node && 'filePath' in node) {
		return node;
	}

	return undefined;
}
