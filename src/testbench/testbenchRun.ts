import {
	buildTestbenchDiscoveryEnvironment,
	nodeTestbenchProcessRunner,
	type DiscoveredTestbench,
	type TestbenchProcessRequest,
	type TestbenchProcessRunner,
} from './testbenchDiscovery';

export const testbenchRunExecution = {
	mode: 'make-test',
	executedWorkspaceCommands: true,
	requiresWorkspaceTrust: true,
} as const;

export type TestbenchWaveFormat = 'ghw' | 'fst' | 'vcd';

export type TestbenchRunOutcome =
	| 'passed'
	| 'failed'
	| 'errored'
	| 'blocked'
	| 'cancelled';

export interface TestbenchRunOutput {
	append(value: string): void;
	appendLine(value: string): void;
	show(preserveFocus?: boolean): void;
}

export interface TestbenchRunOptions {
	readonly workspaceTrusted: boolean;
	readonly makeExecutable?: string;
	readonly defaultStopTime?: string;
	readonly defaultWaveFormat?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly environmentOverrides?: NodeJS.ProcessEnv;
	readonly output: TestbenchRunOutput;
	readonly runner?: TestbenchProcessRunner;
	readonly cancellationSignal?: AbortSignal;
	readonly onOutput?: (chunk: string) => void;
}

export type TestbenchRunTarget = DiscoveredTestbench;

export interface TestbenchRunResult {
	readonly outcome: TestbenchRunOutcome;
	readonly execution: typeof testbenchRunExecution;
	readonly target: TestbenchRunTarget;
	readonly command?: TestbenchProcessRequest;
	readonly exitCode?: number;
	readonly signal?: NodeJS.Signals;
	readonly durationMs: number;
	readonly rawOutput: {
		readonly stdout: string;
		readonly stderr: string;
	};
	readonly message: string;
}

const defaultMakeExecutable = 'make';
const defaultStopTime = '500us';
const defaultWaveFormat: TestbenchWaveFormat = 'ghw';
const supportedWaveFormats = new Set<string>(['ghw', 'fst', 'vcd']);

export class TestbenchRunService {
	private readonly queuesByProjectRoot = new Map<string, Promise<void>>();

	public runTestbench(
		target: TestbenchRunTarget,
		options: TestbenchRunOptions,
	): Promise<TestbenchRunResult> {
		const previousRun = this.queuesByProjectRoot.get(target.projectRootPath) ?? Promise.resolve();
		const run = previousRun
			.catch(() => undefined)
			.then(() => this.runTestbenchNow(target, options));
		const queueTail = run.then(() => undefined, () => undefined);
		this.queuesByProjectRoot.set(target.projectRootPath, queueTail);
		void queueTail.finally(() => {
			if (this.queuesByProjectRoot.get(target.projectRootPath) === queueTail) {
				this.queuesByProjectRoot.delete(target.projectRootPath);
			}
		});
		return run;
	}

	private async runTestbenchNow(
		target: TestbenchRunTarget,
		options: TestbenchRunOptions,
	): Promise<TestbenchRunResult> {
		const startedAt = Date.now();
		const rawOutput = {
			stdout: '',
			stderr: '',
		};

		options.output.show(true);
		writeRunHeader(options.output, target);

		if (!options.workspaceTrusted) {
			const message = 'Workspace trust is required before HDL Dev can run Make targets.';
			options.output.appendLine(`[error] ${message}`);
			return createRunResult('blocked', target, rawOutput, startedAt, message);
		}

		if (isCancellationRequested(options.cancellationSignal)) {
			const message = `Cancelled testbench run for ${target.name}`;
			options.output.appendLine(`[cancelled] ${message}`);
			return createRunResult('cancelled', target, rawOutput, startedAt, message);
		}

		const request = buildTestbenchRunRequest(target, options);
		const runner = options.runner ?? nodeTestbenchProcessRunner;
		writeRunExecutionDetails(options.output, target, request);

		try {
			const processResult = await runner.run(request, {
				onStdout: (chunk) => {
					rawOutput.stdout += chunk;
					options.output.append(chunk);
					options.onOutput?.(chunk);
				},
				onStderr: (chunk) => {
					rawOutput.stderr += chunk;
					options.output.append(chunk);
					options.onOutput?.(chunk);
				},
			});

			if (processResult.signal !== undefined || isCancellationRequested(options.cancellationSignal)) {
				const message = `Cancelled testbench run for ${target.name}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				return createRunResult(
					'cancelled',
					target,
					rawOutput,
					startedAt,
					message,
					request,
					processResult.exitCode,
					processResult.signal,
				);
			}

			if (processResult.exitCode === 0) {
				const message = `Testbench ${target.name} passed`;
				options.output.appendLine('');
				options.output.appendLine(`[ok] ${message}`);
				return createRunResult(
					'passed',
					target,
					rawOutput,
					startedAt,
					message,
					request,
					processResult.exitCode,
				);
			}

			const message = `make test failed for ${target.name} with exit code ${processResult.exitCode}`;
			options.output.appendLine('');
			options.output.appendLine(`[error] ${message}`);
			return createRunResult(
				'failed',
				target,
				rawOutput,
				startedAt,
				message,
				request,
				processResult.exitCode,
			);
		} catch (error) {
			if (isAbortError(error) || isCancellationRequested(options.cancellationSignal)) {
				const message = `Cancelled testbench run for ${target.name}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				return createRunResult(
					'cancelled',
					target,
					rawOutput,
					startedAt,
					message,
					request,
				);
			}

			const message = `Failed to run testbench ${target.name}: ${errorMessage(error)}`;
			options.output.appendLine('');
			options.output.appendLine(`[error] ${message}`);
			return createRunResult(
				'errored',
				target,
				rawOutput,
				startedAt,
				message,
				request,
			);
		}
	}
}

export function buildTestbenchRunRequest(
	target: TestbenchRunTarget,
	options: Pick<
		TestbenchRunOptions,
		| 'makeExecutable'
		| 'defaultStopTime'
		| 'defaultWaveFormat'
		| 'env'
		| 'environmentOverrides'
		| 'cancellationSignal'
	>,
): TestbenchProcessRequest {
	return {
		executablePath: normalizeMakeExecutable(options.makeExecutable),
		args: [
			'test',
			`TB=${target.name}`,
			`STOP_TIME=${normalizeStopTime(options.defaultStopTime)}`,
			`WAVE_FORMAT=${normalizeWaveFormat(options.defaultWaveFormat)}`,
		],
		cwd: target.projectRootPath,
		env: buildTestbenchDiscoveryEnvironment(
			options.env ?? process.env,
			options.environmentOverrides ?? {},
		),
		signal: options.cancellationSignal,
	};
}

function createRunResult(
	outcome: TestbenchRunOutcome,
	target: TestbenchRunTarget,
	rawOutput: TestbenchRunResult['rawOutput'],
	startedAt: number,
	message: string,
	command?: TestbenchProcessRequest,
	exitCode?: number,
	signal?: NodeJS.Signals,
): TestbenchRunResult {
	return {
		outcome,
		execution: testbenchRunExecution,
		target,
		command,
		exitCode,
		signal,
		durationMs: Date.now() - startedAt,
		rawOutput,
		message,
	};
}

function normalizeMakeExecutable(makeExecutable: string | undefined): string {
	const trimmed = makeExecutable?.trim() ?? '';
	return trimmed === '' ? defaultMakeExecutable : trimmed;
}

function normalizeStopTime(stopTime: string | undefined): string {
	const trimmed = stopTime?.trim() ?? '';
	return trimmed === '' ? defaultStopTime : trimmed;
}

function normalizeWaveFormat(waveFormat: string | undefined): TestbenchWaveFormat {
	const trimmed = waveFormat?.trim() ?? '';
	return supportedWaveFormats.has(trimmed) ? trimmed as TestbenchWaveFormat : defaultWaveFormat;
}

function writeRunHeader(output: TestbenchRunOutput, target: TestbenchRunTarget): void {
	output.appendLine('');
	output.appendLine('[HDL Dev] Running GHDL testbench');
	output.appendLine('[HDL Dev] Profile: testbench-run');
	output.appendLine(`[HDL Dev] Testbench: ${target.name}`);
}

function writeRunExecutionDetails(
	output: TestbenchRunOutput,
	target: TestbenchRunTarget,
	request: TestbenchProcessRequest,
): void {
	output.appendLine(`[HDL Dev] Project root: ${target.projectRootPath}`);
	output.appendLine(`[HDL Dev] Executable: ${request.executablePath}`);
	output.appendLine(`[HDL Dev] Arguments: ${JSON.stringify(request.args)}`);
	output.appendLine(`[HDL Dev] Working directory: ${request.cwd}`);
	output.appendLine('');
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
