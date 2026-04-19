import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
	buildTestbenchDiscoveryEnvironment,
	nodeTestbenchProcessRunner,
	type TestbenchProcessRequest,
	type TestbenchProcessRunner,
} from '../testbench/testbenchDiscovery';
import type { DiscoveredSpec } from './specDiscovery';

export const specGenerationExecution = {
	mode: 'make-docs-spec-svg',
	executedWorkspaceCommands: true,
	requiresWorkspaceTrust: true,
} as const;

export type SpecGenerationMode =
	| 'waveform'
	| 'waveformNoRun'
	| 'schematic';

export type SpecGenerationOutcome =
	| 'generated'
	| 'failed'
	| 'errored'
	| 'blocked'
	| 'cancelled'
	| 'invalidTarget'
	| 'missingArtifact';

export interface SpecGenerationOutput {
	append(value: string): void;
	appendLine(value: string): void;
	show(preserveFocus?: boolean): void;
}

export interface SpecGenerationOptions {
	readonly workspaceTrusted: boolean;
	readonly makeExecutable?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly environmentOverrides?: NodeJS.ProcessEnv;
	readonly output: SpecGenerationOutput;
	readonly runner?: TestbenchProcessRunner;
	readonly cancellationSignal?: AbortSignal;
	readonly artifactExists?: (artifactPath: string) => Promise<boolean>;
}

export interface SpecGenerationTarget {
	readonly spec: DiscoveredSpec;
	readonly mode: SpecGenerationMode;
}

export interface SpecGenerationResult {
	readonly outcome: SpecGenerationOutcome;
	readonly execution: typeof specGenerationExecution;
	readonly target: SpecGenerationTarget;
	readonly command?: TestbenchProcessRequest;
	readonly exitCode?: number;
	readonly signal?: NodeJS.Signals;
	readonly durationMs: number;
	readonly artifactPath: string;
	readonly rawOutput: {
		readonly stdout: string;
		readonly stderr: string;
	};
	readonly message: string;
}

const defaultMakeExecutable = 'make';

export class SpecGenerationService {
	private readonly queuesByProjectRoot = new Map<string, Promise<void>>();

	public generateSpecSvg(
		target: SpecGenerationTarget,
		options: SpecGenerationOptions,
	): Promise<SpecGenerationResult> {
		const projectRootPath = target.spec.projectRootPath;
		const previousRun = this.queuesByProjectRoot.get(projectRootPath) ?? Promise.resolve();
		const run = previousRun
			.catch(() => undefined)
			.then(() => this.generateSpecSvgNow(target, options));
		const queueTail = run.then(() => undefined, () => undefined);
		this.queuesByProjectRoot.set(projectRootPath, queueTail);
		void queueTail.finally(() => {
			if (this.queuesByProjectRoot.get(projectRootPath) === queueTail) {
				this.queuesByProjectRoot.delete(projectRootPath);
			}
		});
		return run;
	}

	private async generateSpecSvgNow(
		target: SpecGenerationTarget,
		options: SpecGenerationOptions,
	): Promise<SpecGenerationResult> {
		const startedAt = Date.now();
		const rawOutput = {
			stdout: '',
			stderr: '',
		};
		const artifactPath = getGeneratedSvgPath(target.spec);

		options.output.show(true);
		writeGenerationHeader(options.output, target);

		if (!options.workspaceTrusted) {
			const message = 'Workspace trust is required before HDL Dev can run Make targets.';
			options.output.appendLine(`[error] ${message}`);
			return createGenerationResult('blocked', target, artifactPath, rawOutput, startedAt, message);
		}

		if (target.spec.status !== 'valid') {
			const message = `Cannot generate SVG for invalid JSON spec ${target.spec.fileName}.`;
			options.output.appendLine(`[error] ${message}`);
			return createGenerationResult('invalidTarget', target, artifactPath, rawOutput, startedAt, message);
		}

		if (!isModeCompatibleWithSpec(target)) {
			const message = `Cannot run ${formatModeLabel(target.mode)} for ${target.spec.kind} spec ${target.spec.fileName}.`;
			options.output.appendLine(`[error] ${message}`);
			return createGenerationResult('invalidTarget', target, artifactPath, rawOutput, startedAt, message);
		}

		if (isCancellationRequested(options.cancellationSignal)) {
			const message = `Cancelled SVG generation for ${target.spec.name}`;
			options.output.appendLine(`[cancelled] ${message}`);
			return createGenerationResult('cancelled', target, artifactPath, rawOutput, startedAt, message);
		}

		const request = buildSpecGenerationRequest(target, options);
		const runner = options.runner ?? nodeTestbenchProcessRunner;
		writeGenerationExecutionDetails(options.output, target, request, artifactPath);

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
				const message = `Cancelled SVG generation for ${target.spec.name}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				return createGenerationResult(
					'cancelled',
					target,
					artifactPath,
					rawOutput,
					startedAt,
					message,
					request,
					processResult.exitCode,
					processResult.signal,
				);
			}

			if (processResult.exitCode !== 0) {
				const message = `${request.args[0]} failed for ${target.spec.name} with exit code ${processResult.exitCode}`;
				options.output.appendLine('');
				options.output.appendLine(`[error] ${message}`);
				return createGenerationResult(
					'failed',
					target,
					artifactPath,
					rawOutput,
					startedAt,
					message,
					request,
					processResult.exitCode,
				);
			}

			if (!(await artifactExists(artifactPath, options))) {
				const message = `Generated SVG was not found at ${artifactPath}.`;
				options.output.appendLine('');
				options.output.appendLine(`[error] ${message}`);
				return createGenerationResult(
					'missingArtifact',
					target,
					artifactPath,
					rawOutput,
					startedAt,
					message,
					request,
					processResult.exitCode,
				);
			}

			const message = `Generated ${target.spec.kind} SVG for ${target.spec.name}`;
			options.output.appendLine('');
			options.output.appendLine(`[ok] ${message}`);
			options.output.appendLine(`[HDL Dev] Generated SVG: ${artifactPath}`);
			return createGenerationResult(
				'generated',
				target,
				artifactPath,
				rawOutput,
				startedAt,
				message,
				request,
				processResult.exitCode,
			);
		} catch (error) {
			if (isAbortError(error) || isCancellationRequested(options.cancellationSignal)) {
				const message = `Cancelled SVG generation for ${target.spec.name}`;
				options.output.appendLine('');
				options.output.appendLine(`[cancelled] ${message}`);
				return createGenerationResult(
					'cancelled',
					target,
					artifactPath,
					rawOutput,
					startedAt,
					message,
					request,
				);
			}

			const message = `Failed to generate SVG for ${target.spec.name}: ${errorMessage(error)}`;
			options.output.appendLine('');
			options.output.appendLine(`[error] ${message}`);
			return createGenerationResult(
				'errored',
				target,
				artifactPath,
				rawOutput,
				startedAt,
				message,
				request,
			);
		}
	}
}

export function buildSpecGenerationRequest(
	target: SpecGenerationTarget,
	options: Pick<
		SpecGenerationOptions,
		| 'makeExecutable'
		| 'env'
		| 'environmentOverrides'
		| 'cancellationSignal'
	>,
): TestbenchProcessRequest {
	return {
		executablePath: normalizeMakeExecutable(options.makeExecutable),
		args: buildSpecGenerationArgs(target),
		cwd: target.spec.projectRootPath,
		env: buildTestbenchDiscoveryEnvironment(
			options.env ?? process.env,
			options.environmentOverrides ?? {},
		),
		signal: options.cancellationSignal,
	};
}

export function getGeneratedSvgPath(spec: Pick<DiscoveredSpec, 'kind' | 'name' | 'projectRootPath'>): string {
	const relativeDirectory = spec.kind === 'waveform'
		? path.join('docs', 'waveforms', 'generated')
		: path.join('docs', 'schematics', 'generated');

	return path.join(spec.projectRootPath, relativeDirectory, `${spec.name}.svg`);
}

function buildSpecGenerationArgs(target: SpecGenerationTarget): string[] {
	if (target.spec.kind === 'waveform') {
		const args = [
			'docs-waveforms',
			`WAVEFORM=${target.spec.name}`,
		];

		if (target.mode === 'waveformNoRun') {
			args.push('NO_RUN=1');
		}

		return args;
	}

	return [
		'docs-schematics',
		`SCHEMATIC=${target.spec.name}`,
	];
}

function createGenerationResult(
	outcome: SpecGenerationOutcome,
	target: SpecGenerationTarget,
	artifactPath: string,
	rawOutput: SpecGenerationResult['rawOutput'],
	startedAt: number,
	message: string,
	command?: TestbenchProcessRequest,
	exitCode?: number,
	signal?: NodeJS.Signals,
): SpecGenerationResult {
	return {
		outcome,
		execution: specGenerationExecution,
		target,
		command,
		exitCode,
		signal,
		durationMs: Date.now() - startedAt,
		artifactPath,
		rawOutput,
		message,
	};
}

async function artifactExists(
	artifactPath: string,
	options: SpecGenerationOptions,
): Promise<boolean> {
	if (options.artifactExists !== undefined) {
		return options.artifactExists(artifactPath);
	}

	try {
		const stats = await fs.stat(artifactPath);
		return stats.isFile();
	} catch {
		return false;
	}
}

function isModeCompatibleWithSpec(target: SpecGenerationTarget): boolean {
	if (target.spec.kind === 'waveform') {
		return target.mode === 'waveform' || target.mode === 'waveformNoRun';
	}

	return target.mode === 'schematic';
}

function normalizeMakeExecutable(makeExecutable: string | undefined): string {
	const trimmed = makeExecutable?.trim() ?? '';
	return trimmed === '' ? defaultMakeExecutable : trimmed;
}

function writeGenerationHeader(
	output: SpecGenerationOutput,
	target: SpecGenerationTarget,
): void {
	output.appendLine('');
	output.appendLine(`[HDL Dev] Generating ${target.spec.kind} SVG`);
	output.appendLine('[HDL Dev] Profile: spec-svg-generation');
	output.appendLine(`[HDL Dev] Spec: ${target.spec.name}`);
	output.appendLine(`[HDL Dev] Spec file: ${target.spec.filePath}`);
}

function writeGenerationExecutionDetails(
	output: SpecGenerationOutput,
	target: SpecGenerationTarget,
	request: TestbenchProcessRequest,
	artifactPath: string,
): void {
	output.appendLine(`[HDL Dev] Mode: ${formatModeLabel(target.mode)}`);
	output.appendLine(`[HDL Dev] Project root: ${target.spec.projectRootPath}`);
	output.appendLine(`[HDL Dev] Executable: ${request.executablePath}`);
	output.appendLine(`[HDL Dev] Arguments: ${JSON.stringify(request.args)}`);
	output.appendLine(`[HDL Dev] Working directory: ${request.cwd}`);
	output.appendLine(`[HDL Dev] Expected SVG: ${artifactPath}`);
	output.appendLine('');
}

function formatModeLabel(mode: SpecGenerationMode): string {
	if (mode === 'waveformNoRun') {
		return 'waveform no-rerun';
	}

	return mode;
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
