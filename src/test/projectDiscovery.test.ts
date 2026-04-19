import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	discoverHdlProjects,
	inspectProjectRoot,
	passiveDiscoveryExecution,
} from '../discovery/projectDiscovery';

const tempRoots: string[] = [];

suite('Project Discovery', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('discovers one GEnCor-style project without executing commands', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath, {
			dependencyScript: true,
			waveformSpecs: true,
			schematicSpecs: true,
			artifactDirectories: true,
		});

		const result = await discoverHdlProjects({
			workspaceFolderPaths: [workspacePath],
		});

		assert.deepStrictEqual(result.discovery, passiveDiscoveryExecution);
		assert.strictEqual(result.projects.length, 1);

		const [project] = result.projects;
		assert.strictEqual(project.rootPath, projectPath);
		assert.strictEqual(project.makefilePath, path.join(projectPath, 'Makefile'));
		assert.deepStrictEqual(project.sources, ['workspaceFolder']);
		assert.deepStrictEqual(project.workspaceFolderPaths, [workspacePath]);
		assert.deepStrictEqual(project.discovery, passiveDiscoveryExecution);
		assert.strictEqual(project.dependencyScript.available, true);
		assert.strictEqual(project.specs.waveform.available, true);
		assert.strictEqual(project.specs.schematic.available, true);
		assert.strictEqual(project.artifactDirectories.waveformSvgs.available, true);
		assert.strictEqual(project.artifactDirectories.schematicSvgs.available, true);
		assert.strictEqual(project.discovery.executedWorkspaceCommands, false);
		assert.strictEqual(project.discovery.requiresWorkspaceTrust, false);
	});

	test('handles multi-root workspaces and reports missing optional directories as capabilities', async () => {
		const waveformOnlyProject = await createTempWorkspace();
		await createHdlProject(waveformOnlyProject, {
			waveformSpecs: true,
			schematicSpecs: false,
		});

		const schematicOnlyProject = await createTempWorkspace();
		await createHdlProject(schematicOnlyProject, {
			waveformSpecs: false,
			schematicSpecs: true,
		});

		const result = await discoverHdlProjects({
			workspaceFolderPaths: [schematicOnlyProject, waveformOnlyProject],
		});

		assert.deepStrictEqual(
			result.projects.map((project) => project.rootPath),
			sortPaths([schematicOnlyProject, waveformOnlyProject]),
		);

		const waveformProject = result.projects.find((project) => project.rootPath === waveformOnlyProject);
		assert.ok(waveformProject);
		assert.strictEqual(waveformProject.specs.waveform.available, true);
		assert.strictEqual(waveformProject.specs.schematic.available, false);
		assert.strictEqual(waveformProject.specs.schematic.status, 'missingOptionalDirectory');
		assert.strictEqual(waveformProject.dependencyScript.available, false);
		assert.strictEqual(waveformProject.dependencyScript.status, 'missingOptionalFile');

		const schematicProject = result.projects.find((project) => project.rootPath === schematicOnlyProject);
		assert.ok(schematicProject);
		assert.strictEqual(schematicProject.specs.waveform.available, false);
		assert.strictEqual(schematicProject.specs.waveform.status, 'missingOptionalDirectory');
		assert.strictEqual(schematicProject.specs.schematic.available, true);
	});

	test('discovers explicitly configured roots relative to workspace folders', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'third_party', 'hdl', 'uart');
		await createHdlProject(projectPath, {
			waveformSpecs: true,
		});

		const result = await discoverHdlProjects({
			workspaceFolderPaths: [workspacePath],
			configuredRootPaths: [path.join('third_party', 'hdl', 'uart')],
			maxSearchDepth: 1,
		});

		assert.strictEqual(result.projects.length, 1);
		assert.strictEqual(result.projects[0].rootPath, projectPath);
		assert.deepStrictEqual(
			result.projects[0].sources,
			['configuredRoot'],
		);
		assert.deepStrictEqual(
			result.projects[0].workspaceFolderPaths,
			[workspacePath],
		);
	});

	test('does not treat partial Makefile or spec layouts as projects', async () => {
		const workspacePath = await createTempWorkspace();
		const makefileOnlyPath = path.join(workspacePath, 'makefile-only');
		await writeFixtureFile(path.join(makefileOnlyPath, 'Makefile'), 'list-tbs:\n');

		const specsOnlyPath = path.join(workspacePath, 'specs-only');
		await writeFixtureFile(
			path.join(specsOnlyPath, 'docs', 'waveforms', 'specs', 'timer.json'),
			'{}\n',
		);

		const result = await discoverHdlProjects({
			workspaceFolderPaths: [workspacePath],
		});
		const directInspection = await inspectProjectRoot(makefileOnlyPath);

		assert.deepStrictEqual(result.projects, []);
		assert.strictEqual(directInspection, undefined);
	});
});

interface HdlProjectFixtureOptions {
	readonly dependencyScript?: boolean;
	readonly waveformSpecs?: boolean;
	readonly schematicSpecs?: boolean;
	readonly artifactDirectories?: boolean;
}

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-discovery-'));
	tempRoots.push(tempRoot);
	return tempRoot;
}

async function createHdlProject(
	projectPath: string,
	options: HdlProjectFixtureOptions,
): Promise<void> {
	await writeFixtureFile(path.join(projectPath, 'Makefile'), [
		'list-tbs:',
		'\t@printf "timer_tb\\n"',
		'',
	].join('\n'));

	if (options.dependencyScript === true) {
		await writeFixtureFile(
			path.join(projectPath, 'scripts', 'deps.sh'),
			'#!/usr/bin/env bash\n',
		);
	}

	if (options.waveformSpecs === true) {
		await writeFixtureFile(
			path.join(projectPath, 'docs', 'waveforms', 'specs', 'timer.json'),
			'{}\n',
		);
	}

	if (options.schematicSpecs === true) {
		await writeFixtureFile(
			path.join(projectPath, 'docs', 'schematics', 'specs', 'core.json'),
			'{}\n',
		);
	}

	if (options.artifactDirectories === true) {
		await fs.mkdir(path.join(projectPath, 'docs', 'waveforms', 'generated'), { recursive: true });
		await fs.mkdir(path.join(projectPath, 'docs', 'schematics', 'generated'), { recursive: true });
		await fs.mkdir(path.join(projectPath, 'build', 'waves'), { recursive: true });
		await fs.mkdir(path.join(projectPath, 'logs', 'plots'), { recursive: true });
	}
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf8');
}

function sortPaths(paths: readonly string[]): string[] {
	return [...paths].sort((left, right) => left.localeCompare(right));
}
