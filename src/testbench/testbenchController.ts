import * as path from 'node:path';

import * as vscode from 'vscode';

import { refreshArtifactsCommand } from '../artifacts/artifactsTree';
import {
	createTestbenchItemId,
	TestbenchDiscoveryService,
	type DiscoveredTestbench,
	type TestbenchDiscoveryResult,
	type TestbenchProjectDiscoveryResult,
} from './testbenchDiscovery';
import {
	TestbenchRunService,
	type TestbenchRunOptions,
	type TestbenchRunResult,
	type TestbenchRunTarget,
} from './testbenchRun';

export const testbenchControllerId = 'vscode-hdl-dev.testbenches';

interface RunnableTestbenchItem {
	readonly item: vscode.TestItem;
	readonly target: TestbenchRunTarget;
}

export interface TestbenchRunCommandHost {
	readonly service: Pick<TestbenchRunService, 'runTestbench'>;
	readonly workspaceTrusted: boolean;
	readonly makeExecutable: string;
	readonly defaultStopTime: string;
	readonly defaultWaveFormat: string;
	readonly environmentOverrides: NodeJS.ProcessEnv;
	readonly output: TestbenchRunOptions['output'];
	refreshArtifacts(): Thenable<unknown>;
}

export function registerTestbenchController(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): void {
	const controller = vscode.tests.createTestController(
		testbenchControllerId,
		'HDL Dev Testbenches',
	);
	const discoveryService = new TestbenchDiscoveryService();
	const runService = new TestbenchRunService();
	const runnableTestbenchesByItemId = new Map<string, RunnableTestbenchItem>();

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
			replaceTestItems(controller, result, runnableTestbenchesByItemId);
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
	controller.createRunProfile(
		'Run Testbench',
		vscode.TestRunProfileKind.Run,
		(request, token) => runTestbenches(
			controller,
			runnableTestbenchesByItemId,
			runService,
			outputChannel,
			request,
			token,
		),
		true,
	);

	context.subscriptions.push(controller);
}

function replaceTestItems(
	controller: vscode.TestController,
	result: TestbenchDiscoveryResult,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
): void {
	runnableTestbenchesByItemId.clear();
	controller.items.replace(
		result.projects.map((projectResult) => createProjectTestItem(
			controller,
			projectResult,
			runnableTestbenchesByItemId,
		)),
	);
}

function createProjectTestItem(
	controller: vscode.TestController,
	projectResult: TestbenchProjectDiscoveryResult,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
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
		projectResult.testbenches.map((testbench) => createTestbenchTestItem(
			controller,
			testbench,
			project.makefilePath,
			runnableTestbenchesByItemId,
		)),
	);

	return projectItem;
}

function createTestbenchTestItem(
	controller: vscode.TestController,
	testbench: DiscoveredTestbench,
	makefilePath: string,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
): vscode.TestItem {
	const testbenchItem = controller.createTestItem(
		createTestbenchItemId(testbench.projectRootPath, testbench.name),
		testbench.name,
		vscode.Uri.file(makefilePath),
	);
	testbenchItem.canResolveChildren = false;
	testbenchItem.description = testbench.projectRootPath;
	runnableTestbenchesByItemId.set(testbenchItem.id, {
		item: testbenchItem,
		target: testbench,
	});
	return testbenchItem;
}

async function runTestbenches(
	controller: vscode.TestController,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
	runService: TestbenchRunService,
	outputChannel: vscode.OutputChannel,
	request: vscode.TestRunRequest,
	token: vscode.CancellationToken,
): Promise<void> {
	if (controller.items.size === 0) {
		await controller.resolveHandler?.(undefined);
	}

	const run = controller.createTestRun(request, 'HDL Dev Testbenches');
	const requested = collectRequestedTestbenches(
		controller,
		runnableTestbenchesByItemId,
		request,
	);

	try {
		for (const skipped of requested.skipped) {
			run.skipped(skipped.item);
		}

		if (requested.runnable.length === 0) {
			run.appendOutput('No HDL Dev testbenches selected.\r\n');
			return;
		}

		for (const runnable of requested.runnable) {
			run.enqueued(runnable.item);
		}

		const configuration = vscode.workspace.getConfiguration('hdlDev');
		const makeExecutable = configuration.get<string>('makeExecutable', 'make');
		const defaultStopTime = configuration.get<string>('defaultStopTime', '500us');
		const defaultWaveFormat = configuration.get<string>('defaultWaveFormat', 'ghw');
		const toolchainRoot = configuration.get<string>('toolchainRoot', '').trim();

		for (const runnable of requested.runnable) {
			if (token.isCancellationRequested || run.token.isCancellationRequested) {
				run.skipped(runnable.item);
				continue;
			}

			const abortController = new AbortController();
			const cancellationSubscriptions = [
				token.onCancellationRequested(() => abortController.abort()),
				run.token.onCancellationRequested(() => abortController.abort()),
			];

			if (token.isCancellationRequested || run.token.isCancellationRequested) {
				abortController.abort();
			}

			try {
				run.started(runnable.item);
				const result = await runTestbenchAndRefreshArtifacts({
					service: runService,
					workspaceTrusted: vscode.workspace.isTrusted,
					makeExecutable,
					defaultStopTime,
					defaultWaveFormat,
					environmentOverrides: toolchainRoot === '' ? {} : { GHDL_TOOLCHAIN_ROOT: toolchainRoot },
					output: outputChannel,
					refreshArtifacts: () => vscode.commands.executeCommand(refreshArtifactsCommand),
				}, runnable.target, {
					cancellationSignal: abortController.signal,
					onOutput: (chunk) => run.appendOutput(toTestOutput(chunk), undefined, runnable.item),
				});
				applyTestbenchRunResult(run, runnable.item, result);
			} finally {
				for (const subscription of cancellationSubscriptions) {
					subscription.dispose();
				}
			}
		}
	} finally {
		run.end();
	}
}

export async function runTestbenchAndRefreshArtifacts(
	host: TestbenchRunCommandHost,
	target: TestbenchRunTarget,
	options: Pick<TestbenchRunOptions, 'cancellationSignal' | 'onOutput'> = {},
): Promise<TestbenchRunResult> {
	const result = await host.service.runTestbench(target, {
		workspaceTrusted: host.workspaceTrusted,
		makeExecutable: host.makeExecutable,
		defaultStopTime: host.defaultStopTime,
		defaultWaveFormat: host.defaultWaveFormat,
		environmentOverrides: host.environmentOverrides,
		output: host.output,
		cancellationSignal: options.cancellationSignal,
		onOutput: options.onOutput,
	});

	await host.refreshArtifacts();
	return result;
}

function collectRequestedTestbenches(
	controller: vscode.TestController,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
	request: vscode.TestRunRequest,
): {
	readonly runnable: readonly RunnableTestbenchItem[];
	readonly skipped: readonly RunnableTestbenchItem[];
} {
	const excludedIds = collectExcludedIds(request.exclude ?? []);
	const includedItems = request.include ?? Array.from(controller.items, ([, item]) => item);
	const runnableById = new Map<string, RunnableTestbenchItem>();
	const skippedById = new Map<string, RunnableTestbenchItem>();

	for (const item of includedItems) {
		collectRunnableTestbenches(
			item,
			runnableTestbenchesByItemId,
			excludedIds,
			runnableById,
			skippedById,
		);
	}

	return {
		runnable: Array.from(runnableById.values()),
		skipped: Array.from(skippedById.values()),
	};
}

function collectRunnableTestbenches(
	item: vscode.TestItem,
	runnableTestbenchesByItemId: Map<string, RunnableTestbenchItem>,
	excludedIds: ReadonlySet<string>,
	runnableById: Map<string, RunnableTestbenchItem>,
	skippedById: Map<string, RunnableTestbenchItem>,
): void {
	const runnable = runnableTestbenchesByItemId.get(item.id);

	if (runnable !== undefined) {
		if (excludedIds.has(item.id)) {
			skippedById.set(item.id, runnable);
		} else {
			runnableById.set(item.id, runnable);
		}
		return;
	}

	item.children.forEach((child) => {
		collectRunnableTestbenches(
			child,
			runnableTestbenchesByItemId,
			excludedIds,
			runnableById,
			skippedById,
		);
	});
}

function collectExcludedIds(items: readonly vscode.TestItem[]): ReadonlySet<string> {
	const ids = new Set<string>();

	for (const item of items) {
		collectTestItemIds(item, ids);
	}

	return ids;
}

function collectTestItemIds(item: vscode.TestItem, ids: Set<string>): void {
	ids.add(item.id);
	item.children.forEach((child) => collectTestItemIds(child, ids));
}

function applyTestbenchRunResult(
	run: vscode.TestRun,
	item: vscode.TestItem,
	result: TestbenchRunResult,
): void {
	switch (result.outcome) {
		case 'passed':
			run.passed(item, result.durationMs);
			return;
		case 'failed':
			run.failed(item, new vscode.TestMessage(result.message), result.durationMs);
			return;
		case 'errored':
		case 'blocked':
			run.errored(item, new vscode.TestMessage(result.message), result.durationMs);
			return;
		case 'cancelled':
			run.skipped(item);
			return;
	}
}

function toTestOutput(chunk: string): string {
	return chunk.replace(/\r?\n/g, '\r\n');
}

function createProjectItemId(projectRootPath: string): string {
	return `project::${path.resolve(projectRootPath)}`;
}
