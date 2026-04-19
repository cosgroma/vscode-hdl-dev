import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
	passiveDiscoveryExecution,
	type HdlProjectModel,
	type ProjectCapability,
} from '../discovery/projectDiscovery';
import {
	createSpecItemId,
	type DiscoveredSpec,
	type ProjectSpecDiscoveryResult,
} from '../specs/specDiscovery';
import {
	createSpecsTreeItem,
	createSpecsTreeRootNodes,
	hasHdlProjectsContext,
	refreshSpecsCommand,
	SpecsTreeDataProvider,
	specsTreeViewId,
	type SpecsTreeNode,
} from '../specs/specsTree';

suite('Specs Tree', () => {
	test('creates project, kind, valid spec, and invalid spec tree items', () => {
		const projectResult = createProjectSpecDiscoveryResult();
		const [validSpec] = projectResult.specs.waveform;
		const [invalidSpec] = projectResult.specs.schematic;

		const projectItem = createSpecsTreeItem({
			type: 'project',
			projectResult,
		});
		const kindItem = createSpecsTreeItem({
			type: 'kind',
			projectResult,
			kind: 'waveform',
		});
		const validSpecItem = createSpecsTreeItem({
			type: 'spec',
			spec: validSpec,
		});
		const invalidSpecItem = createSpecsTreeItem({
			type: 'spec',
			spec: invalidSpec,
		});

		assert.strictEqual(projectItem.label, 'timer');
		assert.strictEqual(projectItem.contextValue, 'hdlDev.specs.project');
		assert.strictEqual(kindItem.label, 'Waveform Specs');
		assert.strictEqual(kindItem.description, '1');
		assert.strictEqual(kindItem.contextValue, 'hdlDev.specs.kind.waveform');
		assert.strictEqual(validSpecItem.id, validSpec.id);
		assert.strictEqual(validSpecItem.contextValue, 'hdlDev.specs.spec.waveform.valid');
		assert.strictEqual(validSpecItem.command?.command, 'vscode.open');
		assert.strictEqual(invalidSpecItem.description, 'Invalid JSON');
		assert.strictEqual(invalidSpecItem.contextValue, 'hdlDev.specs.spec.schematic.invalid');
		assert.match(String(invalidSpecItem.tooltip), /Invalid JSON/);
	});

	test('creates empty state nodes when there are no projects', () => {
		const nodes = createSpecsTreeRootNodes({
			outcome: 'noProjects',
			discovery: passiveDiscoveryExecution,
			projects: [],
			message: 'No HDL projects were found for spec discovery.',
		});

		assert.strictEqual(nodes.length, 1);
		assert.strictEqual(nodes[0].type, 'status');
		assert.strictEqual(nodes[0].contextValue, 'hdlDev.specs.status.empty');
	});

	test('refresh sets the HDL project context before exposing project roots', async () => {
		const projectResult = createProjectSpecDiscoveryResult();
		const contextValues: Array<{ readonly key: string; readonly value: boolean }> = [];
		const provider = new SpecsTreeDataProvider(
			() => ({
				workspaceFolderPaths: [],
				projects: [projectResult.project],
			}),
			async (key, value) => {
				contextValues.push({ key, value });
			},
		);

		await provider.refresh();
		const rootNodes = provider.getChildren() as SpecsTreeNode[];

		assert.deepStrictEqual(contextValues, [{
			key: hasHdlProjectsContext,
			value: true,
		}]);
		assert.strictEqual(rootNodes.length, 1);
		assert.strictEqual(rootNodes[0].type, 'project');
		provider.dispose();
	});

	test('package contributes HDL container, Specs view, and refresh command', async () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
			contributes: {
				commands: Array<{ readonly command: string; readonly category?: string }>;
				viewsContainers: {
					activitybar: Array<{ readonly id: string; readonly title: string; readonly icon: string }>;
				};
				views: Record<string, Array<{ readonly id: string; readonly name: string; readonly when?: string }>>;
				menus: {
					'view/title': Array<{ readonly command: string; readonly when: string }>;
				};
			};
		};

		assert.ok(packageJson.contributes.commands.some((command) => (
			command.command === refreshSpecsCommand && command.category === 'HDL Dev'
		)));
		assert.ok(packageJson.contributes.viewsContainers.activitybar.some((container) => (
			container.id === 'hdlDev'
				&& container.title === 'HDL'
				&& container.icon === 'media/hdl.svg'
		)));
		assert.ok(packageJson.contributes.views.hdlDev.some((view) => (
			view.id === specsTreeViewId
				&& view.name === 'Specs'
				&& view.when === hasHdlProjectsContext
		)));
		assert.ok(packageJson.contributes.menus['view/title'].some((menu) => (
			menu.command === refreshSpecsCommand
				&& menu.when === `view == ${specsTreeViewId}`
		)));
	});
});

function createProjectSpecDiscoveryResult(): ProjectSpecDiscoveryResult {
	const project = createHdlProjectModel('/workspace/timer');
	const waveformSpec = createDiscoveredSpec(project.rootPath, 'waveform', 'timer-wave.json', 'valid');
	const schematicSpec = createDiscoveredSpec(project.rootPath, 'schematic', 'broken.json', 'invalid');
	return {
		project,
		specs: {
			waveform: [waveformSpec],
			schematic: [schematicSpec],
		},
	};
}

function createDiscoveredSpec(
	projectRootPath: string,
	kind: DiscoveredSpec['kind'],
	fileName: string,
	status: DiscoveredSpec['status'],
): DiscoveredSpec {
	const specDirectory = kind === 'waveform'
		? path.join('docs', 'waveforms', 'specs')
		: path.join('docs', 'schematics', 'specs');
	const filePath = path.join(projectRootPath, specDirectory, fileName);

	return {
		id: createSpecItemId(projectRootPath, kind, filePath),
		kind,
		status,
		name: path.basename(fileName, '.json'),
		fileName,
		filePath,
		projectRootPath,
		relativePath: path.relative(projectRootPath, filePath),
		errorMessage: status === 'invalid' ? 'Invalid JSON: Unexpected token' : undefined,
	};
}

function createHdlProjectModel(rootPath: string): HdlProjectModel {
	return {
		rootPath,
		makefilePath: path.join(rootPath, 'Makefile'),
		sources: ['workspaceFolder'],
		workspaceFolderPaths: ['/workspace'],
		dependencyScript: capability(rootPath, path.join('scripts', 'deps.sh'), false),
		specs: {
			waveform: capability(rootPath, path.join('docs', 'waveforms', 'specs'), true),
			schematic: capability(rootPath, path.join('docs', 'schematics', 'specs'), true),
		},
		buildDirectories: {
			ghdl: capability(rootPath, path.join('build', 'ghdl'), false),
			waves: capability(rootPath, path.join('build', 'waves'), false),
			schematics: capability(rootPath, path.join('build', 'schematics'), false),
			csv: capability(rootPath, path.join('build', 'csv'), false),
		},
		artifactDirectories: {
			waveformSvgs: capability(rootPath, path.join('docs', 'waveforms', 'generated'), false),
			schematicSvgs: capability(rootPath, path.join('docs', 'schematics', 'generated'), false),
			logs: capability(rootPath, 'logs', false),
			plots: capability(rootPath, path.join('logs', 'plots'), false),
		},
		discovery: passiveDiscoveryExecution,
	};
}

function capability(
	rootPath: string,
	relativePath: string,
	available: boolean,
): ProjectCapability {
	return {
		available,
		path: path.join(rootPath, relativePath),
		status: available ? 'present' : 'missingOptionalDirectory',
	};
}
