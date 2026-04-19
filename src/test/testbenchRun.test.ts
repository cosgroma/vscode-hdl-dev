import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	buildTestbenchRunRequest,
	TestbenchRunService,
	type TestbenchRunOutput,
	type TestbenchRunTarget,
} from '../testbench/testbenchRun';
import type {
	TestbenchProcessEvents,
	TestbenchProcessRequest,
	TestbenchProcessResult,
	TestbenchProcessRunner,
} from '../testbench/testbenchDiscovery';

const tempRoots: string[] = [];

suite('Testbench Run', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('builds make test requests with explicit process arguments', async () => {
		const projectPath = await createTempProject();
		const target = createTarget(projectPath, 'timer_tb');
		const output = new CapturingOutput();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: '[ok] timer_tb\n',
		});

		const result = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: true,
			makeExecutable: 'gmake',
			defaultStopTime: '1us',
			defaultWaveFormat: 'fst',
			env: { PATH: '/usr/bin' },
			output,
			runner,
		});

		assert.strictEqual(result.outcome, 'passed');
		assert.strictEqual(runner.requests.length, 1);
		assert.strictEqual(runner.requests[0].executablePath, 'gmake');
		assert.deepStrictEqual(
			runner.requests[0].args,
			['test', 'TB=timer_tb', 'STOP_TIME=1us', 'WAVE_FORMAT=fst'],
		);
		assert.strictEqual(runner.requests[0].cwd, projectPath);
		assert.strictEqual(result.rawOutput.stdout, '[ok] timer_tb\n');
		assert.match(output.text, /\[ok\] timer_tb/);
	});

	test('maps nonzero exits and runner errors to failed and errored outcomes', async () => {
		const projectPath = await createTempProject();
		const target = createTarget(projectPath, 'timer_tb');
		const failedResult = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner: new FakeProcessRunner({
				exitCode: 2,
				stderr: '[fail] assertion mismatch\n',
			}),
		});

		assert.strictEqual(failedResult.outcome, 'failed');
		assert.strictEqual(failedResult.exitCode, 2);
		assert.match(failedResult.rawOutput.stderr, /assertion mismatch/);

		const erroredResult = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner: new ThrowingProcessRunner(new Error('make unavailable')),
		});

		assert.strictEqual(erroredResult.outcome, 'errored');
		assert.match(erroredResult.message, /make unavailable/);
	});

	test('forwards cancellation to the process request and reports cancellation', async () => {
		const projectPath = await createTempProject();
		const target = createTarget(projectPath, 'timer_tb');
		const abortController = new AbortController();
		const runner = new FakeProcessRunner((request) => {
			assert.strictEqual(request.signal, abortController.signal);
			abortController.abort();
			return {
				exitCode: 1,
				signal: 'SIGTERM',
			};
		});

		const result = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner,
			cancellationSignal: abortController.signal,
		});

		assert.strictEqual(result.outcome, 'cancelled');
		assert.strictEqual(runner.requests.length, 1);
	});

	test('does not run Make when workspace trust is missing or cancellation is already requested', async () => {
		const projectPath = await createTempProject();
		const target = createTarget(projectPath, 'timer_tb');
		const runner = new FakeProcessRunner({
			exitCode: 0,
		});
		const blockedResult = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: false,
			output: new CapturingOutput(),
			runner,
		});
		const abortController = new AbortController();
		abortController.abort();
		const cancelledResult = await new TestbenchRunService().runTestbench(target, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner,
			cancellationSignal: abortController.signal,
		});

		assert.strictEqual(blockedResult.outcome, 'blocked');
		assert.strictEqual(cancelledResult.outcome, 'cancelled');
		assert.strictEqual(runner.requests.length, 0);
	});

	test('serializes runs that share a project root', async () => {
		const projectPath = await createTempProject();
		const service = new TestbenchRunService();
		let activeRuns = 0;
		let maxActiveRuns = 0;
		const runner = new FakeProcessRunner(async () => {
			activeRuns += 1;
			maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
			await delay(20);
			activeRuns -= 1;
			return {
				exitCode: 0,
				stdout: '[ok]\n',
			};
		});

		await Promise.all([
			service.runTestbench(createTarget(projectPath, 'timer_tb'), {
				workspaceTrusted: true,
				output: new CapturingOutput(),
				runner,
			}),
			service.runTestbench(createTarget(projectPath, 'uart_tb'), {
				workspaceTrusted: true,
				output: new CapturingOutput(),
				runner,
			}),
		]);

		assert.strictEqual(maxActiveRuns, 1);
		assert.deepStrictEqual(
			runner.requests.map((request) => request.args[1]),
			['TB=timer_tb', 'TB=uart_tb'],
		);
	});

	test('package contributes testbench run settings', async () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
			contributes: {
				configuration: {
					properties: Record<string, {
						default?: string;
						enum?: string[];
					}>;
				};
			};
		};
		const properties = packageJson.contributes.configuration.properties;

		assert.strictEqual(properties['hdlDev.defaultStopTime'].default, '500us');
		assert.deepStrictEqual(properties['hdlDev.defaultWaveFormat'].enum, ['ghw', 'fst', 'vcd']);
	});

	test('normalizes empty or unsupported run setting values', async () => {
		const projectPath = await createTempProject();
		const request = buildTestbenchRunRequest(createTarget(projectPath, 'timer_tb'), {
			makeExecutable: '',
			defaultStopTime: '',
			defaultWaveFormat: 'unsupported',
			env: {},
		});

		assert.strictEqual(request.executablePath, 'make');
		assert.deepStrictEqual(
			request.args,
			['test', 'TB=timer_tb', 'STOP_TIME=500us', 'WAVE_FORMAT=ghw'],
		);
	});
});

class CapturingOutput implements TestbenchRunOutput {
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
			await delay(response.delayMs);
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

class ThrowingProcessRunner implements TestbenchProcessRunner {
	public constructor(private readonly error: Error) {}

	public run(): Promise<TestbenchProcessResult> {
		return Promise.reject(this.error);
	}
}

async function createTempProject(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-testbench-run-'));
	tempRoots.push(tempRoot);
	await fs.mkdir(tempRoot, { recursive: true });
	return tempRoot;
}

function createTarget(projectRootPath: string, name: string): TestbenchRunTarget {
	return {
		id: `${projectRootPath}::${name}`,
		name,
		projectRootPath,
		projectNamespace: projectRootPath,
	};
}

async function delay(delayMs: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
}
