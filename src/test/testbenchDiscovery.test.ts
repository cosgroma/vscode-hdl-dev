import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	createTestbenchItemId,
	nodeTestbenchProcessRunner,
	parseTestbenchList,
	TestbenchDiscoveryService,
	type TestbenchDiscoveryOutput,
	type TestbenchDiscoveryStateSink,
	type TestbenchProcessEvents,
	type TestbenchProcessRequest,
	type TestbenchProcessResult,
	type TestbenchProcessRunner,
	type TestbenchProjectState,
} from '../testbench/testbenchDiscovery';

const tempRoots: string[] = [];

suite('Testbench Discovery', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('parses line-oriented testbench names while preserving order', () => {
		assert.deepStrictEqual(
			parseTestbenchList([
				'',
				'# managed Makefile comment',
				' timer_tb ',
				'uart_tb',
				'timer_tb',
				'fifo_tb',
				'',
			].join('\n')),
			['timer_tb', 'uart_tb', 'fifo_tb'],
		);
	});

	test('runs make list-tbs with explicit process arguments', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath);
		const output = new CapturingOutput();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: 'timer_tb\nuart_tb\n',
		});

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			env: { PATH: '/usr/bin' },
			output,
			runner,
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.strictEqual(runner.requests.length, 1);
		assert.strictEqual(runner.requests[0].executablePath, 'make');
		assert.deepStrictEqual(runner.requests[0].args, ['list-tbs']);
		assert.strictEqual(runner.requests[0].cwd, projectPath);
		assert.deepStrictEqual(
			result.projects[0].testbenches.map((testbench) => testbench.name),
			['timer_tb', 'uart_tb'],
		);
		assert.strictEqual(result.projects[0].rawOutput.stdout, 'timer_tb\nuart_tb\n');
		assert.match(output.text, /timer_tb/);
	});

	test('keeps same-named testbenches in separate project namespaces', async () => {
		const workspacePath = await createTempWorkspace();
		const alphaProjectPath = path.join(workspacePath, 'alpha', 'timer');
		const betaProjectPath = path.join(workspacePath, 'beta', 'timer');
		await createHdlProject(alphaProjectPath);
		await createHdlProject(betaProjectPath);
		const runner = new FakeProcessRunner((request) => ({
			exitCode: 0,
			stdout: request.cwd === alphaProjectPath ? 'timer_tb\n' : 'timer_tb\nfifo_tb\n',
		}));

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			runner,
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.strictEqual(result.projects.length, 2);
		const testbenchIds = result.projects.flatMap((project) => (
			project.testbenches.map((testbench) => testbench.id)
		));
		assert.strictEqual(new Set(testbenchIds).size, 3);
		assert.ok(testbenchIds.includes(createTestbenchItemId(alphaProjectPath, 'timer_tb')));
		assert.ok(testbenchIds.includes(createTestbenchItemId(betaProjectPath, 'timer_tb')));
		assert.deepStrictEqual(
			result.projects.map((project) => project.project.rootPath),
			[alphaProjectPath, betaProjectPath].sort(),
		);
	});

	test('reports empty and failed discovery without throwing', async () => {
		const workspacePath = await createTempWorkspace();
		const emptyProjectPath = path.join(workspacePath, 'empty');
		const failedProjectPath = path.join(workspacePath, 'failed');
		await createHdlProject(emptyProjectPath);
		await createHdlProject(failedProjectPath);
		const output = new CapturingOutput();
		const runner = new FakeProcessRunner((request) => {
			if (request.cwd === failedProjectPath) {
				return {
					exitCode: 2,
					stderr: '[error] failed list\n',
				};
			}

			return {
				exitCode: 0,
				stdout: '# no testbenches\n\n',
			};
		});

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output,
			runner,
		});

		assert.strictEqual(result.outcome, 'failed');
		assert.deepStrictEqual(
			result.projects.map((project) => project.outcome).sort(),
			['empty', 'failed'],
		);
		assert.match(output.text, /No testbenches were reported/);
		assert.match(output.text, /\[error\] failed list/);
	});

	test('cancels discovery before invoking Make for a project', async () => {
		const workspacePath = await createTempWorkspace();
		await createHdlProject(path.join(workspacePath, 'pcores', 'timer'));
		const abortController = new AbortController();
		abortController.abort();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: 'timer_tb\n',
		});

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			runner,
			cancellationSignal: abortController.signal,
		});

		assert.strictEqual(result.outcome, 'cancelled');
		assert.strictEqual(result.projects[0].outcome, 'cancelled');
		assert.strictEqual(runner.requests.length, 0);
	});

	test('reports slow discovery state while preserving the final result', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath);
		const states = new CapturingStateSink();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: 'timer_tb\n',
			delayMs: 20,
		});

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			stateSink: states,
			runner,
			slowThresholdMs: 1,
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.deepStrictEqual(
			states.states(),
			['discovering', 'slow', 'discovered'],
		);
	});

	test('reuses in-flight discovery for the same project root', async () => {
		const workspacePath = await createTempWorkspace();
		await createHdlProject(path.join(workspacePath, 'pcores', 'timer'));
		const service = new TestbenchDiscoveryService();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: 'timer_tb\n',
			delayMs: 20,
		});
		const options = {
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			runner,
		};

		const [firstResult, secondResult] = await Promise.all([
			service.discoverWorkspace(options),
			service.discoverWorkspace(options),
		]);

		assert.strictEqual(runner.requests.length, 1);
		assert.strictEqual(firstResult.outcome, 'discovered');
		assert.strictEqual(secondResult.outcome, 'discovered');
		assert.strictEqual(firstResult.projects[0], secondResult.projects[0]);
	});

	test('discovers testbenches from a managed-style fixture Makefile', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath, [
			'HDL_DEV_TESTBENCHES := timer_tb uart_tb fifo_tb',
			'',
			'.PHONY: list-tbs',
			'list-tbs:',
			"\t@printf '%s\\n' $(HDL_DEV_TESTBENCHES)",
			'',
		].join('\n'));

		const result = await new TestbenchDiscoveryService().discoverWorkspace({
			workspaceTrusted: true,
			workspaceFolderPaths: [workspacePath],
			output: new CapturingOutput(),
			runner: nodeTestbenchProcessRunner,
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.deepStrictEqual(
			result.projects[0].testbenches.map((testbench) => testbench.name),
			['timer_tb', 'uart_tb', 'fifo_tb'],
		);
	});
});

class CapturingOutput implements TestbenchDiscoveryOutput {
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

class CapturingStateSink implements TestbenchDiscoveryStateSink {
	private readonly projectStates: TestbenchProjectState[] = [];

	setProjectState(state: TestbenchProjectState): void {
		this.projectStates.push(state);
	}

	states(): string[] {
		return this.projectStates.map((state) => state.state);
	}
}

type FakeProcessResponse = TestbenchProcessResult & {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly delayMs?: number;
};

type FakeProcessHandler = (request: TestbenchProcessRequest) => FakeProcessResponse | Promise<FakeProcessResponse>;

class FakeProcessRunner implements TestbenchProcessRunner {
	public readonly requests: TestbenchProcessRequest[] = [];
	private readonly handler: FakeProcessHandler;

	public constructor(response: FakeProcessResponse | FakeProcessHandler) {
		this.handler = typeof response === 'function' ? response : () => response;
	}

	public async run(
		request: TestbenchProcessRequest,
		events: TestbenchProcessEvents,
	): Promise<TestbenchProcessResult> {
		this.requests.push(request);
		const response = await this.handler(request);

		if (response.delayMs !== undefined) {
			await new Promise((resolve) => setTimeout(resolve, response.delayMs));
		}

		if (response.stdout !== undefined) {
			events.onStdout(response.stdout);
		}

		if (response.stderr !== undefined) {
			events.onStderr(response.stderr);
		}

		return response;
	}
}

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-testbench-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

async function createHdlProject(
	projectPath: string,
	makefileContent = [
		'.PHONY: list-tbs',
		'list-tbs:',
		'\t@printf "timer_tb\\n"',
		'',
	].join('\n'),
): Promise<void> {
	await writeFixtureFile(path.join(projectPath, 'Makefile'), makefileContent);
	await writeFixtureFile(
		path.join(projectPath, 'docs', 'waveforms', 'specs', 'timer.json'),
		'{}\n',
	);
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf8');
}
