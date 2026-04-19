import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	createSpecItemId,
	discoverWorkspaceSpecs,
	specDiscoveryExecution,
} from '../specs/specDiscovery';

const tempRoots: string[] = [];

suite('Spec Discovery', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('discovers waveform and schematic spec JSON files with stable IDs', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath, {
			waveformSpecs: [{
				fileName: 'timer-wave.json',
				content: '{ "signals": [] }\n',
			}],
			schematicSpecs: [{
				fileName: 'timer-schematic.json',
				content: '{ "modules": [] }\n',
			}],
		});

		const result = await discoverWorkspaceSpecs({
			workspaceFolderPaths: [workspacePath],
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.deepStrictEqual(result.discovery, specDiscoveryExecution);
		assert.strictEqual(result.projects.length, 1);

		const [projectResult] = result.projects;
		const [waveformSpec] = projectResult.specs.waveform;
		const [schematicSpec] = projectResult.specs.schematic;

		assert.strictEqual(projectResult.project.rootPath, projectPath);
		assert.strictEqual(waveformSpec.status, 'valid');
		assert.strictEqual(waveformSpec.kind, 'waveform');
		assert.strictEqual(waveformSpec.name, 'timer-wave');
		assert.strictEqual(
			waveformSpec.id,
			createSpecItemId(projectPath, 'waveform', waveformSpec.filePath),
		);
		assert.strictEqual(schematicSpec.status, 'valid');
		assert.strictEqual(schematicSpec.kind, 'schematic');
		assert.strictEqual(
			schematicSpec.id,
			createSpecItemId(projectPath, 'schematic', schematicSpec.filePath),
		);
	});

	test('keeps valid specs when one spec contains invalid JSON', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'cores', 'uart');
		await createHdlProject(projectPath, {
			waveformSpecs: [{
				fileName: 'uart-wave.json',
				content: '{ "signals": [] }\n',
			}],
			schematicSpecs: [{
				fileName: 'broken.json',
				content: '{ "modules": [ }\n',
			}],
		});

		const result = await discoverWorkspaceSpecs({
			workspaceFolderPaths: [workspacePath],
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.strictEqual(result.projects.length, 1);
		assert.strictEqual(result.projects[0].specs.waveform[0].status, 'valid');
		assert.strictEqual(result.projects[0].specs.schematic[0].status, 'invalid');
		assert.match(result.projects[0].specs.schematic[0].errorMessage ?? '', /Invalid JSON/);
	});

	test('reports empty projects when spec directories contain no JSON files', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'empty');
		await createHdlProject(projectPath, {
			waveformSpecs: [],
			schematicSpecs: [],
		});

		const result = await discoverWorkspaceSpecs({
			workspaceFolderPaths: [workspacePath],
		});

		assert.strictEqual(result.outcome, 'empty');
		assert.strictEqual(result.projects.length, 1);
		assert.deepStrictEqual(result.projects[0].specs.waveform, []);
		assert.deepStrictEqual(result.projects[0].specs.schematic, []);
	});
});

interface SpecFixture {
	readonly fileName: string;
	readonly content: string;
}

interface HdlSpecProjectFixtureOptions {
	readonly waveformSpecs?: readonly SpecFixture[];
	readonly schematicSpecs?: readonly SpecFixture[];
}

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-specs-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

async function createHdlProject(
	projectPath: string,
	options: HdlSpecProjectFixtureOptions,
): Promise<void> {
	await writeFixtureFile(path.join(projectPath, 'Makefile'), [
		'list-tbs:',
		'\t@printf "timer_tb\\n"',
		'',
	].join('\n'));
	await writeSpecFixtures(
		path.join(projectPath, 'docs', 'waveforms', 'specs'),
		options.waveformSpecs,
	);
	await writeSpecFixtures(
		path.join(projectPath, 'docs', 'schematics', 'specs'),
		options.schematicSpecs,
	);
}

async function writeSpecFixtures(
	directoryPath: string,
	specs: readonly SpecFixture[] | undefined,
): Promise<void> {
	if (specs === undefined) {
		return;
	}

	await fs.mkdir(directoryPath, { recursive: true });

	for (const spec of specs) {
		await writeFixtureFile(path.join(directoryPath, spec.fileName), spec.content);
	}
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf8');
}
