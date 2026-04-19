import * as vscode from 'vscode';

import {
	checkDocsAssetDependenciesCommand,
	checkGhdlDependenciesCommand,
	createUnknownDependencyStatus,
	formatDependencyStatusBar,
	runDependencyCheck,
	type DependencyCheckProfile,
	type DependencyCheckStatus,
} from './doctor/dependencyDoctor';
import { registerSpecGenerationCommands } from './specs/specGenerationCommands';
import { registerSpecsTree } from './specs/specsTree';
import { registerTestbenchController } from './testbench/testbenchController';

export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('HDL Dev');
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	const statusSink = {
		setStatus(status: DependencyCheckStatus): void {
			const presentation = formatDependencyStatusBar(status);
			statusBarItem.text = presentation.text;
			statusBarItem.tooltip = presentation.tooltip;
			statusBarItem.command = presentation.command;
			statusBarItem.show();
		},
	};

	statusSink.setStatus(createUnknownDependencyStatus());
	registerSpecsTree(context);
	registerSpecGenerationCommands(context, outputChannel);
	registerTestbenchController(context, outputChannel);

	const runDoctorCommand = async (profile: DependencyCheckProfile): Promise<void> => {
		const configuration = vscode.workspace.getConfiguration('hdlDev');
		const configuredRootPaths = configuration.get<readonly string[]>('projectRoots', []);
		const depsScriptRelativePath = configuration.get<string>('depsScript', 'scripts/deps.sh');
		const toolchainRoot = configuration.get<string>('toolchainRoot', '').trim();

		await runDependencyCheck({
			profile,
			workspaceTrusted: vscode.workspace.isTrusted,
			workspaceFolderPaths: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
			configuredRootPaths,
			depsScriptRelativePath,
			environmentOverrides: toolchainRoot === '' ? {} : { GHDL_TOOLCHAIN_ROOT: toolchainRoot },
			output: outputChannel,
			statusSink,
			showErrorMessage: (message) => vscode.window.showErrorMessage(message),
		});
	};

	context.subscriptions.push(
		outputChannel,
		statusBarItem,
		vscode.commands.registerCommand(
			checkGhdlDependenciesCommand,
			() => runDoctorCommand('ghdl'),
		),
		vscode.commands.registerCommand(
			checkDocsAssetDependenciesCommand,
			() => runDoctorCommand('docs-assets'),
		),
	);
}

export function deactivate() {}
