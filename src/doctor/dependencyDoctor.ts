import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { discoverHdlProjects } from '../discovery/projectDiscovery';

export const checkGhdlDependenciesCommand = 'vscode-hdl-dev.checkGhdlDependencies';
export const checkDocsAssetDependenciesCommand = 'vscode-hdl-dev.checkDocsAssetDependencies';

export type DependencyCheckProfile = 'ghdl' | 'docs-assets';
export type DependencyCheckOutcome = 'passed' | 'failed' | 'blocked' | 'noTarget';
export type DependencyStatusState = 'unknown' | 'checking' | 'passing' | 'failing';
export type DependencyCheckTargetSource = 'project' | 'workspaceFolder' | 'configuredRoot';

export interface DependencyCheckDefinition {
	readonly profile: DependencyCheckProfile;
	readonly label: string;
	readonly commandTitle: string;
}

export interface DependencyCheckStatus {
	readonly state: DependencyStatusState;
	readonly message: string;
	readonly profile?: DependencyCheckProfile;
	readonly targetRootPath?: string;
	readonly exitCode?: number;
}

export interface DependencyStatusBarPresentation {
	readonly text: string;
	readonly tooltip: string;
	readonly command: string;
}

export interface DependencyOutput {
	append(value: string): void;
	appendLine(value: string): void;
	show(preserveFocus?: boolean): void;
}

export interface DependencyStatusSink {
	setStatus(status: DependencyCheckStatus): void;
}

export interface DependencyCheckTarget {
	readonly rootPath: string;
	readonly depsScriptPath: string;
	readonly source: DependencyCheckTargetSource;
}

export interface DependencyProcessRequest {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
}

export interface DependencyProcessEvents {
	readonly onStdout: (chunk: string) => void;
	readonly onStderr: (chunk: string) => void;
}

export interface DependencyProcessResult {
	readonly exitCode: number;
	readonly signal?: NodeJS.Signals;
}

export interface DependencyProcessRunner {
	run(
		request: DependencyProcessRequest,
		events: DependencyProcessEvents,
	): Promise<DependencyProcessResult>;
}

export interface DependencyCheckOptions {
	readonly profile: DependencyCheckProfile;
	readonly workspaceTrusted: boolean;
	readonly workspaceFolderPaths: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly depsScriptRelativePath?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly environmentOverrides?: NodeJS.ProcessEnv;
	readonly output: DependencyOutput;
	readonly statusSink?: DependencyStatusSink;
	readonly runner?: DependencyProcessRunner;
	readonly showErrorMessage?: (message: string) => PromiseLike<unknown> | unknown;
}

export interface DependencyCheckResult {
	readonly outcome: DependencyCheckOutcome;
	readonly profile: DependencyCheckProfile;
	readonly target?: DependencyCheckTarget;
	readonly exitCode?: number;
	readonly command?: DependencyProcessRequest;
	readonly message: string;
}

export interface DependencyCheckTargetOptions {
	readonly workspaceFolderPaths: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly depsScriptRelativePath?: string;
}

const defaultDependencyScriptPath = path.join('scripts', 'deps.sh');

const dependencyCheckDefinitions: Record<DependencyCheckProfile, DependencyCheckDefinition> = {
	ghdl: {
		profile: 'ghdl',
		label: 'GHDL',
		commandTitle: 'HDL Dev: Check GHDL Dependencies',
	},
	'docs-assets': {
		profile: 'docs-assets',
		label: 'documentation asset',
		commandTitle: 'HDL Dev: Check Documentation Asset Dependencies',
	},
};

const environmentSummaryKeys = [
	'GHDL_TOOLCHAIN_ROOT',
	'HDL_DEV_GHDL_ROOT',
	'HDL_DEV_GHDL_BASE',
	'HDL_DEV_GHDL_TAG',
];

export const nodeDependencyProcessRunner: DependencyProcessRunner = {
	run(request, events) {
		return new Promise((resolve, reject) => {
			const childProcess = spawn(
				request.executablePath,
				[...request.args],
				{
					cwd: request.cwd,
					env: request.env,
					shell: false,
				},
			);

			childProcess.stdout.setEncoding('utf8');
			childProcess.stderr.setEncoding('utf8');
			childProcess.stdout.on('data', (chunk: string) => events.onStdout(chunk));
			childProcess.stderr.on('data', (chunk: string) => events.onStderr(chunk));
			childProcess.on('error', reject);
			childProcess.on('close', (code, signal) => {
				resolve({
					exitCode: code ?? 1,
					signal: signal ?? undefined,
				});
			});
		});
	},
};

export function createUnknownDependencyStatus(): DependencyCheckStatus {
	return {
		state: 'unknown',
		message: 'Dependency status unknown',
	};
}

export function formatDependencyStatusBar(
	status: DependencyCheckStatus,
): DependencyStatusBarPresentation {
	switch (status.state) {
		case 'checking':
			return {
				text: '$(sync~spin) HDL Dev deps',
				tooltip: status.message,
				command: commandForProfile(status.profile),
			};
		case 'passing':
			return {
				text: '$(pass) HDL Dev deps',
				tooltip: status.message,
				command: commandForProfile(status.profile),
			};
		case 'failing':
			return {
				text: '$(error) HDL Dev deps',
				tooltip: status.message,
				command: commandForProfile(status.profile),
			};
		case 'unknown':
			return {
				text: '$(beaker) HDL Dev deps',
				tooltip: status.message,
				command: checkGhdlDependenciesCommand,
			};
	}
}

export function buildDependencyCheckEnvironment(
	baseEnv: NodeJS.ProcessEnv = process.env,
	overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...baseEnv,
		...overrides,
	};

	if (env.GHDL_TOOLCHAIN_ROOT !== undefined && env.GHDL_TOOLCHAIN_ROOT.trim() !== '') {
		const ghdlBinPath = path.join(env.GHDL_TOOLCHAIN_ROOT, 'bin');
		env.PATH = env.PATH === undefined || env.PATH === ''
			? ghdlBinPath
			: `${ghdlBinPath}${path.delimiter}${env.PATH}`;
	}

	return env;
}

export async function runDependencyCheck(
	options: DependencyCheckOptions,
): Promise<DependencyCheckResult> {
	const definition = dependencyCheckDefinitions[options.profile];
	const depsScriptRelativePath = options.depsScriptRelativePath ?? defaultDependencyScriptPath;
	const runner = options.runner ?? nodeDependencyProcessRunner;

	options.output.show(true);

	if (!options.workspaceTrusted) {
		const message = 'Workspace trust is required before HDL Dev can run dependency scripts.';
		writeHeader(options.output, definition, message);
		options.output.appendLine(`[error] ${message}`);
		options.statusSink?.setStatus({
			state: 'failing',
			profile: options.profile,
			message,
		});
		await notifyError(options, message);
		return {
			outcome: 'blocked',
			profile: options.profile,
			message,
		};
	}

	const target = await findDependencyCheckTarget({
		workspaceFolderPaths: options.workspaceFolderPaths,
		configuredRootPaths: options.configuredRootPaths,
		depsScriptRelativePath,
	});

	if (target === undefined) {
		const message = `No ${depsScriptRelativePath} dependency script was found in the workspace.`;
		writeHeader(options.output, definition, message);
		options.output.appendLine(`[error] ${message}`);
		options.statusSink?.setStatus({
			state: 'failing',
			profile: options.profile,
			message,
		});
		await notifyError(options, message);
		return {
			outcome: 'noTarget',
			profile: options.profile,
			message,
		};
	}

	const env = buildDependencyCheckEnvironment(
		options.env ?? process.env,
		options.environmentOverrides ?? {},
	);
	const request: DependencyProcessRequest = {
		executablePath: target.depsScriptPath,
		args: ['check', options.profile],
		cwd: target.rootPath,
		env,
	};

	options.statusSink?.setStatus({
		state: 'checking',
		profile: options.profile,
		targetRootPath: target.rootPath,
		message: `Checking ${definition.label} dependencies`,
	});
	writeHeader(options.output, definition, `Running ${definition.commandTitle}`);
	writeExecutionDetails(options.output, target, request);

	try {
		const processResult = await runner.run(request, {
			onStdout: (chunk) => options.output.append(chunk),
			onStderr: (chunk) => options.output.append(chunk),
		});

		if (processResult.exitCode === 0) {
			const message = `${definition.label} dependencies passed`;
			options.output.appendLine('');
			options.output.appendLine(`[ok] ${message}`);
			options.statusSink?.setStatus({
				state: 'passing',
				profile: options.profile,
				targetRootPath: target.rootPath,
				exitCode: processResult.exitCode,
				message,
			});
			return {
				outcome: 'passed',
				profile: options.profile,
				target,
				exitCode: processResult.exitCode,
				command: request,
				message,
			};
		}

		const message = `${definition.label} dependency check failed with exit code ${processResult.exitCode}`;
		options.output.appendLine('');
		options.output.appendLine(`[error] ${message}`);
		options.statusSink?.setStatus({
			state: 'failing',
			profile: options.profile,
			targetRootPath: target.rootPath,
			exitCode: processResult.exitCode,
			message,
		});
		await notifyError(options, `${message}. See the HDL Dev output channel for details.`);
		return {
			outcome: 'failed',
			profile: options.profile,
			target,
			exitCode: processResult.exitCode,
			command: request,
			message,
		};
	} catch (error) {
		const message = `Failed to run ${definition.commandTitle}: ${errorMessage(error)}`;
		options.output.appendLine('');
		options.output.appendLine(`[error] ${message}`);
		options.statusSink?.setStatus({
			state: 'failing',
			profile: options.profile,
			targetRootPath: target.rootPath,
			message,
		});
		await notifyError(options, `${message}. See the HDL Dev output channel for details.`);
		return {
			outcome: 'failed',
			profile: options.profile,
			target,
			command: request,
			message,
		};
	}
}

export async function findDependencyCheckTarget(
	options: DependencyCheckTargetOptions,
): Promise<DependencyCheckTarget | undefined> {
	const workspaceFolderPaths = options.workspaceFolderPaths.map((folderPath) => path.resolve(folderPath));
	const depsScriptRelativePath = options.depsScriptRelativePath ?? defaultDependencyScriptPath;
	const targetsByScriptPath = new Map<string, DependencyCheckTarget>();

	const discoveryResult = await discoverHdlProjects({
		workspaceFolderPaths,
		configuredRootPaths: options.configuredRootPaths,
	});

	for (const project of discoveryResult.projects) {
		await addCandidateTarget(
			targetsByScriptPath,
			project.rootPath,
			resolveDepsScriptPath(project.rootPath, depsScriptRelativePath),
			project.sources.includes('configuredRoot') ? 'configuredRoot' : 'project',
		);
	}

	for (const workspaceFolderPath of workspaceFolderPaths) {
		await addCandidateTarget(
			targetsByScriptPath,
			workspaceFolderPath,
			resolveDepsScriptPath(workspaceFolderPath, depsScriptRelativePath),
			'workspaceFolder',
		);
	}

	return Array.from(targetsByScriptPath.values())
		.sort(compareDependencyCheckTargets)[0];
}

function commandForProfile(profile: DependencyCheckProfile | undefined): string {
	if (profile === 'docs-assets') {
		return checkDocsAssetDependenciesCommand;
	}

	return checkGhdlDependenciesCommand;
}

function compareDependencyCheckTargets(
	left: DependencyCheckTarget,
	right: DependencyCheckTarget,
): number {
	const priorityDifference = targetSourcePriority(left.source) - targetSourcePriority(right.source);

	if (priorityDifference !== 0) {
		return priorityDifference;
	}

	return left.rootPath.localeCompare(right.rootPath);
}

function targetSourcePriority(source: DependencyCheckTargetSource): number {
	switch (source) {
		case 'project':
			return 0;
		case 'configuredRoot':
			return 1;
		case 'workspaceFolder':
			return 2;
	}
}

async function addCandidateTarget(
	targetsByScriptPath: Map<string, DependencyCheckTarget>,
	rootPath: string,
	depsScriptPath: string,
	source: DependencyCheckTargetSource,
): Promise<void> {
	if (!(await isFile(depsScriptPath)) || targetsByScriptPath.has(depsScriptPath)) {
		return;
	}

	targetsByScriptPath.set(depsScriptPath, {
		rootPath,
		depsScriptPath,
		source,
	});
}

function resolveDepsScriptPath(rootPath: string, depsScriptPath: string): string {
	if (path.isAbsolute(depsScriptPath)) {
		return path.resolve(depsScriptPath);
	}

	return path.resolve(rootPath, depsScriptPath);
}

function writeHeader(
	output: DependencyOutput,
	definition: DependencyCheckDefinition,
	message: string,
): void {
	output.appendLine('');
	output.appendLine(`[HDL Dev] ${message}`);
	output.appendLine(`[HDL Dev] Profile: ${definition.profile}`);
}

function writeExecutionDetails(
	output: DependencyOutput,
	target: DependencyCheckTarget,
	request: DependencyProcessRequest,
): void {
	output.appendLine(`[HDL Dev] Target root: ${target.rootPath}`);
	output.appendLine(`[HDL Dev] Target source: ${target.source}`);
	output.appendLine(`[HDL Dev] Executable: ${request.executablePath}`);
	output.appendLine(`[HDL Dev] Arguments: ${JSON.stringify(request.args)}`);
	output.appendLine(`[HDL Dev] Working directory: ${request.cwd}`);
	output.appendLine('[HDL Dev] Environment:');
	for (const key of environmentSummaryKeys) {
		output.appendLine(`  ${key}=${request.env[key] ?? '<unset>'}`);
	}
	output.appendLine('');
}

async function notifyError(
	options: DependencyCheckOptions,
	message: string,
): Promise<void> {
	await options.showErrorMessage?.(message);
}

async function isFile(candidatePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(candidatePath);
		return stats.isFile();
	} catch {
		return false;
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
