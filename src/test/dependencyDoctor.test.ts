import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	checkDocsAssetDependenciesCommand,
	checkGhdlDependenciesCommand,
	formatDependencyStatusBar,
	runDependencyCheck,
	type DependencyCheckStatus,
	type DependencyOutput,
	type DependencyProcessEvents,
	type DependencyProcessRequest,
	type DependencyProcessResult,
	type DependencyProcessRunner,
} from '../doctor/dependencyDoctor';

const tempRoots: string[] = [];

suite('Dependency Doctor', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('runs GHDL dependency checks with explicit process arguments', async () => {
		const workspacePath = await createTempWorkspace();
		const depsScriptPath = await createDepsScript(workspacePath);
		const output = new CapturingOutput();
		const statuses = new CapturingStatusSink();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: '[ok] ghdl present\n',
		});

		const result = await runDependencyCheck({
			profile: 'ghdl',
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			env: { PATH: '/usr/bin' },
			output,
			statusSink: statuses,
			runner,
		});

		assert.strictEqual(result.outcome, 'passed');
		assert.strictEqual(runner.requests.length, 1);
		assert.strictEqual(runner.requests[0].executablePath, depsScriptPath);
		assert.deepStrictEqual(runner.requests[0].args, ['check', 'ghdl']);
		assert.strictEqual(runner.requests[0].cwd, workspacePath);
		assert.match(output.text, /\[ok\] ghdl present/);
		assert.deepStrictEqual(
			statuses.states(),
			['checking', 'passing'],
		);
	});

	test('reports failed checks without hiding raw output', async () => {
		const workspacePath = await createTempWorkspace();
		await createDepsScript(workspacePath);
		const output = new CapturingOutput();
		const statuses = new CapturingStatusSink();
		const errors: string[] = [];
		const runner = new FakeProcessRunner({
			exitCode: 2,
			stderr: '[warn] Missing ghdl\n',
		});

		const result = await runDependencyCheck({
			profile: 'ghdl',
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output,
			statusSink: statuses,
			runner,
			showErrorMessage: (message) => errors.push(message),
		});

		assert.strictEqual(result.outcome, 'failed');
		assert.strictEqual(result.exitCode, 2);
		assert.match(output.text, /\[warn\] Missing ghdl/);
		assert.match(output.text, /failed with exit code 2/);
		assert.deepStrictEqual(
			statuses.states(),
			['checking', 'failing'],
		);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0], /See the HDL Dev output channel/);
	});

	test('blocks dependency scripts when workspace trust is missing', async () => {
		const workspacePath = await createTempWorkspace();
		await createDepsScript(workspacePath);
		const output = new CapturingOutput();
		const statuses = new CapturingStatusSink();
		const errors: string[] = [];
		const runner = new FakeProcessRunner({
			exitCode: 0,
		});

		const result = await runDependencyCheck({
			profile: 'docs-assets',
			workspaceTrusted: false,
			workspaceFolderPaths: [workspacePath],
			output,
			statusSink: statuses,
			runner,
			showErrorMessage: (message) => errors.push(message),
		});

		assert.strictEqual(result.outcome, 'blocked');
		assert.strictEqual(runner.requests.length, 0);
		assert.match(output.text, /Workspace trust is required/);
		assert.deepStrictEqual(statuses.states(), ['failing']);
		assert.strictEqual(errors.length, 1);
	});

	test('prefers discovered HDL project dependency scripts over workspace fallback scripts', async () => {
		const workspacePath = await createTempWorkspace();
		await createDepsScript(workspacePath);
		const projectPath = path.join(workspacePath, 'hdl', 'timer');
		const projectDepsScriptPath = await createDepsScript(projectPath);
		await writeFixtureFile(path.join(projectPath, 'Makefile'), 'list-tbs:\n');
		await writeFixtureFile(
			path.join(projectPath, 'docs', 'waveforms', 'specs', 'timer.json'),
			'{}\n',
		);

		const runner = new FakeProcessRunner({
			exitCode: 0,
		});

		const result = await runDependencyCheck({
			profile: 'ghdl',
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			runner,
		});

		assert.strictEqual(result.outcome, 'passed');
		assert.strictEqual(runner.requests[0].executablePath, projectDepsScriptPath);
		assert.strictEqual(runner.requests[0].cwd, projectPath);
	});

	test('formats status item states and command routing', () => {
		assert.deepStrictEqual(
			formatDependencyStatusBar({
				state: 'unknown',
				message: 'Dependency status unknown',
			}),
			{
				text: '$(beaker) HDL Dev deps',
				tooltip: 'Dependency status unknown',
				command: checkGhdlDependenciesCommand,
			},
		);

		assert.strictEqual(
			formatDependencyStatusBar({
				state: 'checking',
				message: 'Checking documentation asset dependencies',
				profile: 'docs-assets',
			}).command,
			checkDocsAssetDependenciesCommand,
		);
	});

	test('package contributes Dependency Doctor commands', async () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
			contributes: {
				commands: Array<{
					command: string;
					title: string;
					category?: string;
				}>;
			};
		};

		const commandIds = packageJson.contributes.commands.map((command) => command.command);
		assert.ok(commandIds.includes(checkDocsAssetDependenciesCommand));
		assert.ok(commandIds.includes(checkGhdlDependenciesCommand));
		assert.ok(packageJson.contributes.commands.every((command) => command.category === 'HDL Dev'));
	});
});

class CapturingOutput implements DependencyOutput {
	public text = '';
	public shown = false;

	append(value: string): void {
		this.text += value;
	}

	appendLine(value: string): void {
		this.text += `${value}\n`;
	}

	show(): void {
		this.shown = true;
	}
}

class CapturingStatusSink {
	public readonly statuses: DependencyCheckStatus[] = [];

	setStatus(status: DependencyCheckStatus): void {
		this.statuses.push(status);
	}

	states(): string[] {
		return this.statuses.map((status) => status.state);
	}
}

class FakeProcessRunner implements DependencyProcessRunner {
	public readonly requests: DependencyProcessRequest[] = [];

	public constructor(
		private readonly result: DependencyProcessResult & {
			readonly stdout?: string;
			readonly stderr?: string;
		},
	) {}

	public async run(
		request: DependencyProcessRequest,
		events: DependencyProcessEvents,
	): Promise<DependencyProcessResult> {
		this.requests.push(request);

		if (this.result.stdout !== undefined) {
			events.onStdout(this.result.stdout);
		}

		if (this.result.stderr !== undefined) {
			events.onStderr(this.result.stderr);
		}

		return this.result;
	}
}

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-doctor-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

async function createDepsScript(rootPath: string): Promise<string> {
	const depsScriptPath = path.join(rootPath, 'scripts', 'deps.sh');
	await writeFixtureFile(depsScriptPath, '#!/usr/bin/env bash\n');
	return depsScriptPath;
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf8');
}
