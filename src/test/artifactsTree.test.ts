import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
	ArtifactsTreeDataProvider,
	artifactsTreeViewId,
	createArtifactsTreeItem,
	createArtifactsTreeRootNodes,
	refreshArtifactsCommand,
	type ArtifactsTreeGroupNode,
	type ArtifactsTreeNode,
} from '../artifacts/artifactsTree';
import { artifactKinds } from '../artifacts/artifactDiscovery';
import { hasHdlProjectsContext } from '../specs/specsTree';

const tempRoots: string[] = [];

suite('Artifacts Tree', () => {
	teardown(async () => {
		await Promise.all(tempRoots.splice(0).map(async (tempRoot) => {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}));
	});

	test('creates grouped project, artifact type, and artifact tree items', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'timer');
		await createHdlProject(projectPath);
		await writeFixtureFile(path.join(projectPath, 'docs', 'waveforms', 'generated', 'timer-wave.svg'), '<svg />');
		const contextValues: Array<{ readonly key: string; readonly value: boolean }> = [];
		const provider = new ArtifactsTreeDataProvider(
			() => ({
				workspaceFolderPaths: [workspacePath],
			}),
			async (key, value) => {
				contextValues.push({ key, value });
			},
		);

		await provider.refresh();

		const rootNodes = provider.getChildren() as ArtifactsTreeNode[];
		const projectNode = rootNodes[0];
		assert.strictEqual(projectNode.type, 'project');

		const projectItem = createArtifactsTreeItem(projectNode);
		const groupNodes = provider.getChildren(projectNode) as ArtifactsTreeNode[];
		const waveformSvgGroupNode = groupNodes.find((node): node is ArtifactsTreeGroupNode => (
			node.type === 'group' && node.group.kind === 'waveformSvg'
		));
		assert.ok(waveformSvgGroupNode);

		const groupItem = createArtifactsTreeItem(waveformSvgGroupNode);
		const artifactNodes = provider.getChildren(waveformSvgGroupNode) as ArtifactsTreeNode[];
		const artifactNode = artifactNodes[0];
		assert.strictEqual(artifactNode.type, 'artifact');
		const artifactItem = createArtifactsTreeItem(artifactNode);

		assert.deepStrictEqual(contextValues, [{
			key: hasHdlProjectsContext,
			value: true,
		}]);
		assert.strictEqual(projectItem.label, 'timer');
		assert.strictEqual(projectItem.contextValue, 'hdlDev.artifacts.project');
		assert.strictEqual(groupNodes.length, artifactKinds().length);
		assert.strictEqual(groupItem.label, 'Waveform SVGs');
		assert.strictEqual(groupItem.description, '1');
		assert.strictEqual(groupItem.contextValue, 'hdlDev.artifacts.kind.waveformSvg');
		assert.strictEqual(artifactItem.label, 'timer-wave.svg');
		assert.strictEqual(artifactItem.contextValue, 'hdlDev.artifacts.artifact.waveformSvg');
		assert.strictEqual(artifactItem.command?.command, 'vscode.open');

		provider.dispose();
	});

	test('creates empty root states when artifact discovery has no projects', () => {
		const nodes = createArtifactsTreeRootNodes({
			outcome: 'noProjects',
			discovery: {
				mode: 'passive-file-scan',
				executedWorkspaceCommands: false,
				requiresWorkspaceTrust: false,
			},
			projects: [],
			message: 'No HDL projects were found for artifact discovery.',
		});

		assert.strictEqual(nodes.length, 1);
		assert.strictEqual(nodes[0].type, 'status');
		assert.strictEqual(nodes[0].contextValue, 'hdlDev.artifacts.status.empty');
	});

	test('reports missing artifact directories with actionable empty messages', async () => {
		const workspacePath = await createTempWorkspace();
		const projectPath = path.join(workspacePath, 'pcores', 'empty');
		await createHdlProject(projectPath);
		const provider = new ArtifactsTreeDataProvider(
			() => ({
				workspaceFolderPaths: [workspacePath],
			}),
			async () => {},
		);

		await provider.refresh();

		const [projectNode] = provider.getChildren() as ArtifactsTreeNode[];
		assert.strictEqual(projectNode.type, 'project');
		const groupNodes = provider.getChildren(projectNode) as ArtifactsTreeNode[];
		const waveDumpGroupNode = groupNodes.find((node): node is ArtifactsTreeGroupNode => (
			node.type === 'group' && node.group.kind === 'waveDump'
		));
		assert.ok(waveDumpGroupNode);
		const [emptyNode] = provider.getChildren(waveDumpGroupNode) as ArtifactsTreeNode[];
		const emptyItem = createArtifactsTreeItem(emptyNode);

		assert.strictEqual(emptyNode.type, 'status');
		assert.strictEqual(emptyItem.label, 'Wave Dumps directory missing');
		assert.match(String(emptyItem.description), /Run a testbench/);

		provider.dispose();
	});

	test('package contributes Artifacts view and refresh command', async () => {
		const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
		const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
			activationEvents: string[];
			contributes: {
				commands: Array<{ readonly command: string; readonly category?: string }>;
				views: Record<string, Array<{ readonly id: string; readonly name: string; readonly when?: string }>>;
				menus: {
					'view/title': Array<{ readonly command: string; readonly when: string }>;
				};
			};
		};

		assert.ok(packageJson.activationEvents.includes(`onView:${artifactsTreeViewId}`));
		assert.ok(packageJson.activationEvents.includes(`onCommand:${refreshArtifactsCommand}`));
		assert.ok(packageJson.contributes.commands.some((command) => (
			command.command === refreshArtifactsCommand && command.category === 'HDL Dev'
		)));
		assert.ok(packageJson.contributes.views.hdlDev.some((view) => (
			view.id === artifactsTreeViewId
				&& view.name === 'Artifacts'
				&& view.when === hasHdlProjectsContext
		)));
		assert.ok(packageJson.contributes.menus['view/title'].some((menu) => (
			menu.command === refreshArtifactsCommand
				&& menu.when === `view == ${artifactsTreeViewId}`
		)));
	});
});

async function createTempWorkspace(): Promise<string> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hdl-dev-artifacts-tree-'));
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
