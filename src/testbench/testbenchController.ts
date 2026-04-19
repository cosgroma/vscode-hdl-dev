import * as path from 'node:path';

import * as vscode from 'vscode';

import {
	createTestbenchItemId,
	TestbenchDiscoveryService,
	type TestbenchDiscoveryResult,
	type TestbenchProjectDiscoveryResult,
} from './testbenchDiscovery';

export const testbenchControllerId = 'vscode-hdl-dev.testbenches';

export function registerTestbenchController(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): void {
	const controller = vscode.tests.createTestController(
		testbenchControllerId,
		'HDL Dev Testbenches',
	);
	const discoveryService = new TestbenchDiscoveryService();

	const refresh = async (token?: vscode.CancellationToken): Promise<void> => {
		const configuration = vscode.workspace.getConfiguration('hdlDev');
		const configuredRootPaths = configuration.get<readonly string[]>('projectRoots', []);
		const makeExecutable = configuration.get<string>('makeExecutable', 'make');
		const toolchainRoot = configuration.get<string>('toolchainRoot', '').trim();
		const abortController = new AbortController();
		const cancellationSubscription = token?.onCancellationRequested(() => {
			abortController.abort();
		});

		if (token?.isCancellationRequested === true) {
			abortController.abort();
		}

		try {
			const result = await discoveryService.discoverWorkspace({
				workspaceTrusted: vscode.workspace.isTrusted,
				workspaceFolderPaths: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
				configuredRootPaths,
				makeExecutable,
				environmentOverrides: toolchainRoot === '' ? {} : { GHDL_TOOLCHAIN_ROOT: toolchainRoot },
				output: outputChannel,
				cancellationSignal: abortController.signal,
			});
			replaceTestItems(controller, result);
		} finally {
			cancellationSubscription?.dispose();
		}
	};

	controller.refreshHandler = refresh;
	controller.resolveHandler = async (item) => {
		if (item === undefined) {
			await refresh();
		}
	};

	context.subscriptions.push(controller);
}

function replaceTestItems(
	controller: vscode.TestController,
	result: TestbenchDiscoveryResult,
): void {
	controller.items.replace(
		result.projects.map((projectResult) => createProjectTestItem(controller, projectResult)),
	);
}

function createProjectTestItem(
	controller: vscode.TestController,
	projectResult: TestbenchProjectDiscoveryResult,
): vscode.TestItem {
	const project = projectResult.project;
	const projectItem = controller.createTestItem(
		createProjectItemId(project.rootPath),
		path.basename(project.rootPath),
		vscode.Uri.file(project.rootPath),
	);
	projectItem.description = project.rootPath;
	projectItem.canResolveChildren = false;

	if (projectResult.outcome === 'failed' || projectResult.outcome === 'cancelled') {
		projectItem.error = projectResult.message;
	}

	projectItem.children.replace(
		projectResult.testbenches.map((testbench) => {
			const testbenchItem = controller.createTestItem(
				createTestbenchItemId(testbench.projectRootPath, testbench.name),
				testbench.name,
				vscode.Uri.file(project.makefilePath),
			);
			testbenchItem.canResolveChildren = false;
			testbenchItem.description = project.rootPath;
			return testbenchItem;
		}),
	);

	return projectItem;
}

function createProjectItemId(projectRootPath: string): string {
	return `project::${path.resolve(projectRootPath)}`;
}
