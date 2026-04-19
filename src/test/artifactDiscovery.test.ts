import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	artifactDiscoveryExecution,
	artifactKindLabel,
	createArtifactItemId,
	discoverWorkspaceArtifacts,
	type ArtifactKind,
} from '../artifacts/artifactDiscovery';

const tempRoots: string[] = [];

suite('Artifact Discovery', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('discovers generated artifacts by project and type with stable IDs', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath);
		await Promise.all([
			writeFixtureFile(path.join(projectPath, 'build', 'waves', 'timer_tb.ghw'), 'wave'),
			writeFixtureFile(path.join(projectPath, 'docs', 'waveforms', 'generated', 'timer-wave.svg'), '<svg />'),
			writeFixtureFile(path.join(projectPath, 'docs', 'schematics', 'generated', 'timer-core.svg'), '<svg />'),
			writeFixtureFile(path.join(projectPath, 'build', 'schematics', 'timer-core', 'timer-core.json'), '{}'),
			writeFixtureFile(path.join(projectPath, 'logs', 'run.log'), 'log'),
			writeFixtureFile(path.join(projectPath, 'logs', 'plots', 'latency.svg'), '<svg />'),
			writeFixtureFile(path.join(projectPath, 'build', 'csv', 'results.csv'), 'value\n'),
		]);

		const result = await discoverWorkspaceArtifacts({
			workspaceFolderPaths: [workspacePath],
		});

		assert.strictEqual(result.outcome, 'discovered');
		assert.deepStrictEqual(result.discovery, artifactDiscoveryExecution);
		assert.strictEqual(result.projects.length, 1);
		assert.strictEqual(result.projects[0].project.rootPath, projectPath);
		assert.strictEqual(result.message, 'Discovered 7 HDL artifacts.');

		const groups = result.projects[0].groups;
		assertGroup(groups.waveDump, 'waveDump', 'Wave Dumps', ['timer_tb.ghw']);
		assertGroup(groups.waveformSvg, 'waveformSvg', 'Waveform SVGs', ['timer-wave.svg']);
		assertGroup(groups.schematicSvg, 'schematicSvg', 'Schematic SVGs', ['timer-core.svg']);
		assertGroup(groups.schematicJson, 'schematicJson', 'Schematic JSON', ['timer-core.json']);
		assertGroup(groups.log, 'log', 'Logs', ['run.log']);
		assertGroup(groups.plot, 'plot', 'Plots', ['latency.svg']);
		assertGroup(groups.csv, 'csv', 'CSV Outputs', ['results.csv']);
		assert.strictEqual(
			groups.waveDump.artifacts[0].id,
			createArtifactItemId(
				projectPath,
				'waveDump',
				path.join(projectPath, 'build', 'waves', 'timer_tb.ghw'),
			),
		);
		assert.strictEqual(
			groups.schematicJson.artifacts[0].relativePath,
			path.join('build', 'schematics', 'timer-core', 'timer-core.json'),
		);
	});

	test('reports missing artifact directories as empty groups', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'empty');
		await createHdlProject(projectPath);

		const result = await discoverWorkspaceArtifacts({
			workspaceFolderPaths: [workspacePath],
		});

		assert.strictEqual(result.outcome, 'empty');
		assert.strictEqual(result.projects.length, 1);

		for (const kind of ['waveDump', 'waveformSvg', 'schematicSvg', 'schematicJson', 'log', 'plot', 'csv'] as const) {
			const group = result.projects[0].groups[kind];
			assert.strictEqual(group.kind, kind);
			assert.strictEqual(group.label, artifactKindLabel(kind));
			assert.strictEqual(group.directoryAvailable, false);
			assert.deepStrictEqual(group.artifacts, []);
			assert.strictEqual(group.truncated, false);
		}
	});

	test('caps large artifact groups without scanning past the requested limit', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'busy');
		await createHdlProject(projectPath);
		await Promise.all([
			writeFixtureFile(path.join(projectPath, 'build', 'waves', 'a.ghw'), 'a'),
			writeFixtureFile(path.join(projectPath, 'build', 'waves', 'b.ghw'), 'b'),
			writeFixtureFile(path.join(projectPath, 'build', 'waves', 'c.ghw'), 'c'),
		]);

		const result = await discoverWorkspaceArtifacts({
			workspaceFolderPaths: [workspacePath],
			maxArtifactsPerGroup: 2,
		});
		const waveDumpGroup = result.projects[0].groups.waveDump;

		assert.strictEqual(result.outcome, 'discovered');
		assert.strictEqual(waveDumpGroup.truncated, true);
		assert.deepStrictEqual(
			waveDumpGroup.artifacts.map((artifact) => artifact.fileName),
			['a.ghw', 'b.ghw'],
		);
	});
});

function assertGroup(
	group: {
		readonly kind: ArtifactKind;
		readonly label: string;
		readonly directoryAvailable: boolean;
		readonly artifacts: readonly { readonly fileName: string }[];
	},
	kind: ArtifactKind,
	label: string,
	fileNames: readonly string[],
): void {
	assert.strictEqual(group.kind, kind);
	assert.strictEqual(group.label, label);
	assert.strictEqual(group.directoryAvailable, true);
	assert.deepStrictEqual(
		group.artifacts.map((artifact) => artifact.fileName),
		fileNames,
	);
}

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-artifacts-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

async function createHdlProject(projectPath: string): Promise<void> {
	await writeFixtureFile(path.join(projectPath, 'Makefile'), [
		'list-tbs:',
		'\t@printf "timer_tb\\n"',
		'',
	].join('\n'));
	await fs.mkdir(path.join(projectPath, 'docs', 'waveforms', 'specs'), { recursive: true });
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf8');
}
