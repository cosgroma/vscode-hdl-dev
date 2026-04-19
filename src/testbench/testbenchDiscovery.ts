import { spawn } from 'node:child_process';
import * as path from 'node:path';

import {
	discoverHdlProjects,
	type HdlProjectModel,
} from '../discovery/projectDiscovery';

export const testbenchDiscoveryExecution = {
	mode: 'make-list-tbs',
	executedWorkspaceCommands: true,
	requiresWorkspaceTrust: true,
} as const;

export type TestbenchDiscoveryOutcome =
	| 'discovered'
	| 'empty'
	| 'failed'
	| 'blocked'
	| 'noProjects'
	| 'cancelled';

export type TestbenchProjectDiscoveryState =
	| 'discovering'
	| 'slow'
	| 'discovered'
	| 'empty'
	| 'failed'
	| 'cancelled';

export interface TestbenchDiscoveryOutput {
	append(value: string): void;
	appendLine(value: string): void;
	show(preserveFocus?: boolean): void;
}

export interface TestbenchDiscoveryStateSink {
	setProjectState(state: TestbenchProjectState): void;
}

export interface TestbenchProjectState {
	readonly projectRootPath: string;
	readonly state: TestbenchProjectDiscoveryState;
	readonly message: string;
}

export interface TestbenchProcessRequest {
	readonly executablePath: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
}

export interface TestbenchProcessEvents {
	readonly onStdout: (chunk: string) => void;
	readonly onStderr: (chunk: string) => void;
}

export interface TestbenchProcessResult {
	readonly exitCode: number;
	readonly signal?: NodeJS.Signals;
}

export interface TestbenchProcessRunner {
	run(
		request: TestbenchProcessRequest,
		events: TestbenchProcessEvents,
	): Promise<TestbenchProcessResult>;
}

export interface TestbenchDiscoveryOptions {
	readonly workspaceTrusted: boolean;
	readonly workspaceFolderPaths: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly makeExecutable?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly environmentOverrides?: NodeJS.ProcessEnv;
	readonly output: TestbenchDiscoveryOutput;
	readonly stateSink?: TestbenchDiscoveryStateSink;
	readonly runner?: TestbenchProcessRunner;
	readonly cancellationSignal?: AbortSignal;
	readonly slowThresholdMs?: number;
}

export interface DiscoveredTestbench {
	readonly id: string;
	readonly name: string;
	readonly projectRootPath: string;
	readonly projectNamespace: string;
}

export interface TestbenchProjectDiscoveryResult {
	readonly outcome: TestbenchDiscoveryOutcome;
	readonly project: HdlProjectModel;
	readonly testbenches: readonly DiscoveredTestbench[];
	readonly command?: TestbenchProcessRequest;
	readonly exitCode?: number;
	readonly rawOutput: {
		readonly stdout: string;
		readonly stderr: string;
	};
	readonly message: string;
}

export interface TestbenchDiscoveryResult {
	readonly outcome: TestbenchDiscoveryOutcome;
	readonly discovery: typeof testbenchDiscoveryExecution;
	readonly projects: readonly TestbenchProjectDiscoveryResult[];
	readonly message: string;
}

const defaultMakeExecutable = 'make';
const defaultSlowThresholdMs = 5000;

export const nodeTestbenchProcessRunner: TestbenchProcessRunner = {
	run(request, events) {
		return new Promise((resolve, reject) => {
			const childProcess = spawn(
				request.executablePath,
				[...request.args],
				{
					cwd: request.cwd,
					env: request.env,
					shell: false,
					signal: request.signal,
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

export class TestbenchDiscoveryService {
	private readonly inFlightByProjectRoot = new Map<string, Promise<TestbenchProjectDiscoveryResult>>();

	public async discoverWorkspace(
		options: TestbenchDiscoveryOptions,
	): Promise<TestbenchDiscoveryResult> {
		options.output.show(true);

		if (!options.workspaceTrusted) {
			const message = 'Workspace trust is required before HDL Dev can run Make targets.';
			writeWorkspaceHeader(options.output, message);
			options.output.appendLine(`[error] ${message}`);
			return {
				outcome: 'blocked',
				discovery: testbenchDiscoveryExecution,
				projects: [],
				message,
			};
		}

		const discoveryResult = await discoverHdlProjects({
			workspaceFolderPaths: options.workspaceFolderPaths,
			configuredRootPaths: options.configuredRootPaths,
		});

		if (discoveryResult.projects.length === 0) {
			const message = 'No HDL projects were found for testbench discovery.';
			writeWorkspaceHeader(options.output, message);
			options.output.appendLine(`[warn] ${message}`);
			return {
				outcome: 'noProjects',
				discovery: testbenchDiscoveryExecution,
				projects: [],
				message,
			};
		}

		writeWorkspaceHeader(options.output, 'Discovering GHDL testbenches');
		const projects = await Promise.all(
			discoveryResult.projects.map((project) => this.discoverProject(project, options)),
		);

		return {
			outcome: aggregateProjectOutcomes(projects),
			discovery: testbenchDiscoveryExecution,
			projects,
			message: formatWorkspaceMessage(projects),
		};
	}

	private discoverProject(
		project: HdlProjectModel,
		options: TestbenchDiscoveryOptions,
	): Promise<TestbenchProjectDiscoveryResult> {
		const existing = this.inFlightByProjectRoot.get(project.rootPath);

		if (existing !== undefined) {
			return existing;
		}

		const promise = this.runProjectDiscovery(project, options)
			.finally(() => {
				this.inFlightByProjectRoot.delete(project.rootPath);
			});
		this.inFlightByProjectRoot.set(project.rootPath, promise);
		return promise;
	}

	private async runProjectDiscovery(
		project: HdlProjectModel,
		options: TestbenchDiscoveryOptions,
	): Promise<TestbenchProjectDiscoveryResult> {
		const runner = options.runner ?? nodeTestbenchProcessRunner;
		const makeExecutable = normalizeMakeExecutable(options.makeExecutable);
		const env = buildTestbenchDiscoveryEnvironment(
			options.env ?? process.env,
			options.environmentOverrides ?? {},
		);
		const request: TestbenchProcessRequest = {
			executablePath: makeExecutable,
			args: ['list-tbs'],
			cwd: project.rootPath,
			env,
			signal: options.cancellationSignal,
		};
		const rawOutput = {
			stdout: '',
			stderr: '',
		};

		if (isCancellationRequested(options.cancellationSignal)) {
			const message = `Cancelled testbench discovery for ${project.rootPath}`;
			options.output.appendLine(`[cancelled] ${message}`);
			options.stateSink?.setProjectState({
				projectRootPath: project.rootPath,
				state: 'cancelled',
				message,
			});
			return {
				outcome: 'cancelled',
				project,
				testbenches: [],
				command: request,
				rawOutput,
				message,
			};
		}

		options.stateSink?.setProjectState({
			projectRootPath: project.rootPath,
			state: 'discovering',
			message: `Discovering testbenches in ${project.rootPath}`,
		});
		writeProjectExecutionDetails(options.output, project, request);

		let slowTimer: NodeJS.Timeout | undefined;
		const slowThresholdMs = Math.max(0, options.slowThresholdMs ?? defaultSlowThresholdMs);

		if (slowThresholdMs >= 0) {
			slowTimer = setTimeout(() => {
				const message = `Testbench discovery is still running for ${project.rootPath}`;
				options.output.appendLine(`[warn] ${message}`);
				options.stateSink?.setProjectState({
					projectRootPath: project.rootPath,
					state: 'slow',
					message,
				});
			}, slowThresholdMs);
		}

		try {
			const processResult = await runner.run(request, {
				onStdout: (chunk) => {
					rawOutput.stdout += chunk;
					options.output.append(chunk);
				},
				onStderr: (chunk) => {
					rawOutput.stderr += chunk;
					options.output.append(chunk);
				},
			});

			if (processResult.signal !== undefined || isCancellationRequested(options.cancellationSignal)) {
				const message = `Cancelled testbench discovery for ${project.rootPath}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				options.stateSink?.setProjectState({
					projectRootPath: project.rootPath,
					state: 'cancelled',
					message,
				});
				return {
					outcome: 'cancelled',
					project,
					testbenches: [],
					command: request,
					exitCode: processResult.exitCode,
					rawOutput,
					message,
				};
			}

			if (processResult.exitCode !== 0) {
				const message = `make list-tbs failed for ${project.rootPath} with exit code ${processResult.exitCode}`;
				options.output.appendLine('');
				options.output.appendLine(`[error] ${message}`);
				options.stateSink?.setProjectState({
					projectRootPath: project.rootPath,
					state: 'failed',
					message,
				});
				return {
					outcome: 'failed',
					project,
					testbenches: [],
					command: request,
					exitCode: processResult.exitCode,
					rawOutput,
					message,
				};
			}

			const testbenches = parseTestbenchList(rawOutput.stdout).map((name) => ({
				id: createTestbenchItemId(project.rootPath, name),
				name,
				projectRootPath: project.rootPath,
				projectNamespace: project.rootPath,
			}));

			if (testbenches.length === 0) {
				const message = `No testbenches were reported by ${project.rootPath}`;
				options.output.appendLine('');
				options.output.appendLine(`[warn] ${message}`);
				options.stateSink?.setProjectState({
					projectRootPath: project.rootPath,
					state: 'empty',
					message,
				});
				return {
					outcome: 'empty',
					project,
					testbenches,
					command: request,
					exitCode: processResult.exitCode,
					rawOutput,
					message,
				};
			}

			const message = `Discovered ${testbenches.length} testbench${testbenches.length === 1 ? '' : 'es'} in ${project.rootPath}`;
			options.output.appendLine('');
			options.output.appendLine(`[ok] ${message}`);
			options.stateSink?.setProjectState({
				projectRootPath: project.rootPath,
				state: 'discovered',
				message,
			});
			return {
				outcome: 'discovered',
				project,
				testbenches,
				command: request,
				exitCode: processResult.exitCode,
				rawOutput,
				message,
			};
		} catch (error) {
			if (isAbortError(error) || isCancellationRequested(options.cancellationSignal)) {
				const message = `Cancelled testbench discovery for ${project.rootPath}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				options.stateSink?.setProjectState({
					projectRootPath: project.rootPath,
					state: 'cancelled',
					message,
				});
				return {
					outcome: 'cancelled',
					project,
					testbenches: [],
					command: request,
					rawOutput,
					message,
				};
			}

			const message = `Failed to run make list-tbs for ${project.rootPath}: ${errorMessage(error)}`;
			options.output.appendLine('');
			options.output.appendLine(`[error] ${message}`);
			options.stateSink?.setProjectState({
				projectRootPath: project.rootPath,
				state: 'failed',
				message,
			});
			return {
				outcome: 'failed',
				project,
				testbenches: [],
				command: request,
				rawOutput,
				message,
			};
		} finally {
			if (slowTimer !== undefined) {
				clearTimeout(slowTimer);
			}
		}
	}
}

export function parseTestbenchList(output: string): string[] {
	const testbenchNames: string[] = [];
	const seen = new Set<string>();

	for (const line of output.split(/\r?\n/)) {
		const testbenchName = line.trim();

		if (testbenchName === '' || testbenchName.startsWith('#') || seen.has(testbenchName)) {
			continue;
		}

		seen.add(testbenchName);
		testbenchNames.push(testbenchName);
	}

	return testbenchNames;
}

export function createTestbenchItemId(projectRootPath: string, testbenchName: string): string {
	return `${path.resolve(projectRootPath)}::${testbenchName}`;
}

export function buildTestbenchDiscoveryEnvironment(
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

function normalizeMakeExecutable(makeExecutable: string | undefined): string {
	const trimmed = makeExecutable?.trim() ?? '';
	return trimmed === '' ? defaultMakeExecutable : trimmed;
}

function writeWorkspaceHeader(
	output: TestbenchDiscoveryOutput,
	message: string,
): void {
	output.appendLine('');
	output.appendLine(`[HDL Dev] ${message}`);
	output.appendLine('[HDL Dev] Profile: testbench-discovery');
}

function writeProjectExecutionDetails(
	output: TestbenchDiscoveryOutput,
	project: HdlProjectModel,
	request: TestbenchProcessRequest,
): void {
	output.appendLine(`[HDL Dev] Project root: ${project.rootPath}`);
	output.appendLine(`[HDL Dev] Executable: ${request.executablePath}`);
	output.appendLine(`[HDL Dev] Arguments: ${JSON.stringify(request.args)}`);
	output.appendLine(`[HDL Dev] Working directory: ${request.cwd}`);
	output.appendLine('');
}

function aggregateProjectOutcomes(
	projects: readonly TestbenchProjectDiscoveryResult[],
): TestbenchDiscoveryOutcome {
	if (projects.some((project) => project.outcome === 'discovered')) {
		return 'discovered';
	}

	if (projects.every((project) => project.outcome === 'cancelled')) {
		return 'cancelled';
	}

	if (projects.every((project) => project.outcome === 'failed')) {
		return 'failed';
	}

	if (projects.every((project) => project.outcome === 'empty')) {
		return 'empty';
	}

	if (projects.every((project) => project.outcome === 'blocked')) {
		return 'blocked';
	}

	return 'failed';
}

function formatWorkspaceMessage(
	projects: readonly TestbenchProjectDiscoveryResult[],
): string {
	const count = projects.reduce(
		(total, project) => total + project.testbenches.length,
		0,
	);
	return `Discovered ${count} testbench${count === 1 ? '' : 'es'} across ${projects.length} project${projects.length === 1 ? '' : 's'}`;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

function isCancellationRequested(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
