import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	generateSchematicSvgCommand,
	generateWaveformSvgCommand,
	generateWaveformSvgNoRunCommand,
	runSpecGenerationCommand,
	type SpecGenerationCommandHost,
} from '../specs/specGenerationCommands';
import {
	buildSpecGenerationRequest,
	getGeneratedSvgPath,
	specGenerationExecution,
	SpecGenerationService as CoreSpecGenerationService,
	type SpecGenerationOutput,
	type SpecGenerationOptions,
	type SpecGenerationResult,
	type SpecGenerationTarget,
} from '../specs/specGeneration';
import type { DiscoveredSpec } from '../specs/specDiscovery';
import { specsTreeViewId } from '../specs/specsTree';
import type {
	TestbenchProcessEvents,
	TestbenchProcessRequest,
	TestbenchProcessResult,
	TestbenchProcessRunner,
} from '../testbench/testbenchDiscovery';

const tempRoots: string[] = [];

suite('Spec Generation', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('builds waveform, waveform no-rerun, and schematic Make requests', async () => {
		const projectPath = await createTempProject();
		const waveformSpec = createSpec(projectPath, 'waveform', 'timer-wave');
		const schematicSpec = createSpec(projectPath, 'schematic', 'timer-core');

		assert.deepStrictEqual(
			buildSpecGenerationRequest({
				spec: waveformSpec,
				mode: 'waveform',
			}, {
				makeExecutable: 'gmake',
				env: { PATH: '/usr/bin' },
			}).args,
			['docs-waveforms', 'WAVEFORM=timer-wave'],
		);
		assert.deepStrictEqual(
			buildSpecGenerationRequest({
				spec: waveformSpec,
				mode: 'waveformNoRun',
			}, {
				makeExecutable: 'gmake',
				env: { PATH: '/usr/bin' },
			}).args,
			['docs-waveforms', 'WAVEFORM=timer-wave', 'NO_RUN=1'],
		);

		const schematicRequest = buildSpecGenerationRequest({
			spec: schematicSpec,
			mode: 'schematic',
		}, {
			makeExecutable: 'gmake',
			env: { PATH: '/usr/bin' },
		});

		assert.strictEqual(schematicRequest.executablePath, 'gmake');
		assert.deepStrictEqual(schematicRequest.args, ['docs-schematics', 'SCHEMATIC=timer-core']);
		assert.strictEqual(schematicRequest.cwd, projectPath);
	});

	test('preserves output and reports generated SVG artifacts', async () => {
		const projectPath = await createTempProject();
		const spec = createSpec(projectPath, 'waveform', 'timer-wave');
		const output = new CapturingOutput();
		const runner = new FakeProcessRunner({
			exitCode: 0,
			stdout: 'generating waveform svg\n',
			stderr: 'python detail\n',
		});

		const result = await new CoreSpecGenerationService().generateSpecSvg({
			spec,
			mode: 'waveform',
		}, {
			workspaceTrusted: true,
			output,
			runner,
			artifactExists: async () => true,
		});

		assert.strictEqual(result.outcome, 'generated');
		assert.strictEqual(runner.requests.length, 1);
		assert.strictEqual(result.rawOutput.stdout, 'generating waveform svg\n');
		assert.strictEqual(result.rawOutput.stderr, 'python detail\n');
		assert.match(output.text, /generating waveform svg/);
		assert.match(output.text, /Generated SVG:/);
		assert.strictEqual(result.artifactPath, getGeneratedSvgPath(spec));
	});

	test('reports missing SVG artifacts after a successful Make exit', async () => {
		const projectPath = await createTempProject();
		const spec = createSpec(projectPath, 'schematic', 'timer-core');
		const result = await new CoreSpecGenerationService().generateSpecSvg({
			spec,
			mode: 'schematic',
		}, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner: new FakeProcessRunner({
				exitCode: 0,
			}),
			artifactExists: async () => false,
		});

		assert.strictEqual(result.outcome, 'missingArtifact');
		assert.match(result.message, /Generated SVG was not found/);
		assert.match(result.message, /timer-core\.svg/);
	});

	test('blocks untrusted workspaces and invalid JSON specs before running Make', async () => {
		const projectPath = await createTempProject();
		const runner = new FakeProcessRunner({
			exitCode: 0,
		});
		const blocked = await new CoreSpecGenerationService().generateSpecSvg({
			spec: createSpec(projectPath, 'waveform', 'timer-wave'),
			mode: 'waveform',
		}, {
			workspaceTrusted: false,
			output: new CapturingOutput(),
			runner,
		});
		const invalid = await new CoreSpecGenerationService().generateSpecSvg({
			spec: createSpec(projectPath, 'waveform', 'broken-wave', 'invalid'),
			mode: 'waveform',
		}, {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner,
		});

		assert.strictEqual(blocked.outcome, 'blocked');
		assert.strictEqual(invalid.outcome, 'invalidTarget');
		assert.strictEqual(runner.requests.length, 0);
	});

	test('serializes generation that shares a project root', async () => {
		const projectPath = await createTempProject();
		const service = new CoreSpecGenerationService();
		let activeRuns = 0;
		let maxActiveRuns = 0;
		const runner = new FakeProcessRunner(async () => {
			activeRuns += 1;
			maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
			await delay(20);
			activeRuns -= 1;
			return {
				exitCode: 0,
			};
		});
		const options = {
			workspaceTrusted: true,
			output: new CapturingOutput(),
			runner,
			artifactExists: async () => true,
		};

		await Promise.all([
			service.generateSpecSvg({
				spec: createSpec(projectPath, 'waveform', 'timer-wave'),
				mode: 'waveform',
			}, options),
			service.generateSpecSvg({
				spec: createSpec(projectPath, 'schematic', 'timer-core'),
				mode: 'schematic',
			}, options),
		]);

		assert.strictEqual(maxActiveRuns, 1);
		assert.deepStrictEqual(
			runner.requests.map((request) => request.args[0]),
			['docs-waveforms', 'docs-schematics'],
		);
	});

	test('opens generated SVGs and refreshes artifacts after successful tree command execution', async () => {
		const projectPath = await createTempProject();
		const spec = createSpec(projectPath, 'waveform', 'timer-wave');
		const generatedResult = createGeneratedResult(spec);
		const service = new FakeSpecGenerationService(generatedResult);
		const host = new CapturingCommandHost(service);

		const result = await runSpecGenerationCommand(host, 'waveform', {
			type: 'spec',
			spec,
		});

		assert.strictEqual(result, generatedResult);
		assert.deepStrictEqual(host.openedArtifacts, [generatedResult.artifactPath]);
		assert.deepStrictEqual(host.informationMessages, [generatedResult.message]);
		assert.strictEqual(host.artifactRefreshes, 1);
		assert.deepStrictEqual(host.errorMessages, []);
	});

	test('package contributes Specs tree generation commands and context menus', async () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
			contributes: {
				commands: Array<{ readonly command: string; readonly category?: string }>;
				menus: {
					'view/item/context': Array<{
						readonly command: string;
						readonly when: string;
					}>;
				};
			};
		};
		const commandIds = packageJson.contributes.commands.map((command) => command.command);
		const contextMenus = packageJson.contributes.menus['view/item/context'];

		for (const command of [
			generateWaveformSvgCommand,
			generateWaveformSvgNoRunCommand,
			generateSchematicSvgCommand,
		]) {
			assert.ok(commandIds.includes(command));
		}

		assert.ok(contextMenus.some((menu) => (
			menu.command === generateWaveformSvgCommand
				&& menu.when === `view == ${specsTreeViewId} && viewItem == hdlDev.specs.spec.waveform.valid`
		)));
		assert.ok(contextMenus.some((menu) => (
			menu.command === generateWaveformSvgNoRunCommand
				&& menu.when === `view == ${specsTreeViewId} && viewItem == hdlDev.specs.spec.waveform.valid`
		)));
		assert.ok(contextMenus.some((menu) => (
			menu.command === generateSchematicSvgCommand
				&& menu.when === `view == ${specsTreeViewId} && viewItem == hdlDev.specs.spec.schematic.valid`
		)));
	});
});

class CapturingOutput implements SpecGenerationOutput {
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

class CapturingCommandHost implements SpecGenerationCommandHost {
	public readonly workspaceTrusted = true;
	public readonly output = new CapturingOutput();
	public readonly makeExecutable = 'make';
	public readonly environmentOverrides = {};
	public readonly openedArtifacts: string[] = [];
	public readonly errorMessages: string[] = [];
	public readonly informationMessages: string[] = [];
	public artifactRefreshes = 0;

	public constructor(public readonly service: CoreSpecGenerationService) {}

	public async openGeneratedSvg(artifactPath: string): Promise<void> {
		this.openedArtifacts.push(artifactPath);
	}

	public async refreshArtifacts(): Promise<void> {
		this.artifactRefreshes += 1;
	}

	public async showErrorMessage(message: string): Promise<void> {
		this.errorMessages.push(message);
	}

	public async showInformationMessage(message: string): Promise<void> {
		this.informationMessages.push(message);
	}
}

class FakeSpecGenerationService extends CoreSpecGenerationService {
	public constructor(private readonly result: SpecGenerationResult) {
		super();
	}

	public override async generateSpecSvg(
		_target: SpecGenerationTarget,
		_options: SpecGenerationOptions,
	): Promise<SpecGenerationResult> {
		return this.result;
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

async function createTempProject(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-spec-generation-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

function createSpec(
	projectRootPath: string,
	kind: DiscoveredSpec['kind'],
	name: string,
	status: DiscoveredSpec['status'] = 'valid',
): DiscoveredSpec {
	const specDirectory = kind === 'waveform'
		? path.join('docs', 'waveforms', 'specs')
		: path.join('docs', 'schematics', 'specs');
	const fileName = `${name}.json`;
	const filePath = path.join(projectRootPath, specDirectory, fileName);

	return {
		id: `${projectRootPath}::${kind}::${name}`,
		kind,
		status,
		name,
		fileName,
		filePath,
		projectRootPath,
		relativePath: path.relative(projectRootPath, filePath),
		errorMessage: status === 'invalid' ? 'Invalid JSON: Unexpected token' : undefined,
	};
}

function createGeneratedResult(spec: DiscoveredSpec): SpecGenerationResult {
	return {
		outcome: 'generated',
		execution: specGenerationExecution,
		target: {
			spec,
			mode: 'waveform',
		},
		durationMs: 1,
		artifactPath: getGeneratedSvgPath(spec),
		rawOutput: {
			stdout: 'generated\n',
			stderr: '',
		},
		message: `Generated waveform SVG for ${spec.name}`,
	};
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
