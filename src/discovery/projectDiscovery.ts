import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const passiveDiscoveryExecution = {
	mode: 'passive-file-scan',
	executedWorkspaceCommands: false,
	requiresWorkspaceTrust: false,
} as const;

export type ProjectDiscoverySource = 'workspaceFolder' | 'configuredRoot';
export type ProjectCapabilityStatus =
	| 'present'
	| 'missingOptionalDirectory'
	| 'missingOptionalFile';

export interface ProjectDiscoveryOptions {
	readonly workspaceFolderPaths?: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly maxSearchDepth?: number;
}

export interface ProjectCapability {
	readonly available: boolean;
	readonly path: string;
	readonly status: ProjectCapabilityStatus;
}

export interface HdlProjectModel {
	readonly rootPath: string;
	readonly makefilePath: string;
	readonly sources: readonly ProjectDiscoverySource[];
	readonly workspaceFolderPaths: readonly string[];
	readonly dependencyScript: ProjectCapability;
	readonly specs: {
		readonly waveform: ProjectCapability;
		readonly schematic: ProjectCapability;
	};
	readonly buildDirectories: {
		readonly ghdl: ProjectCapability;
		readonly waves: ProjectCapability;
		readonly schematics: ProjectCapability;
		readonly csv: ProjectCapability;
	};
	readonly artifactDirectories: {
		readonly waveformSvgs: ProjectCapability;
		readonly schematicSvgs: ProjectCapability;
		readonly logs: ProjectCapability;
		readonly plots: ProjectCapability;
	};
	readonly discovery: typeof passiveDiscoveryExecution;
}

export interface ProjectDiscoveryResult {
	readonly discovery: typeof passiveDiscoveryExecution;
	readonly scannedRootPaths: readonly string[];
	readonly projects: readonly HdlProjectModel[];
}

interface CandidateProjectRoot {
	readonly rootPath: string;
	readonly sources: Set<ProjectDiscoverySource>;
	readonly workspaceFolderPaths: Set<string>;
}

interface ScanRequest {
	readonly rootPath: string;
	readonly source: ProjectDiscoverySource;
	readonly workspaceFolderPath?: string;
	readonly maxDepth: number;
}

const defaultMaxSearchDepth = 3;

const projectRelativePaths = {
	makefile: 'Makefile',
	dependencyScript: path.join('scripts', 'deps.sh'),
	waveformSpecs: path.join('docs', 'waveforms', 'specs'),
	schematicSpecs: path.join('docs', 'schematics', 'specs'),
	ghdlBuild: path.join('build', 'ghdl'),
	wavesBuild: path.join('build', 'waves'),
	schematicBuild: path.join('build', 'schematics'),
	csvBuild: path.join('build', 'csv'),
	waveformSvgs: path.join('docs', 'waveforms', 'generated'),
	schematicSvgs: path.join('docs', 'schematics', 'generated'),
	logs: 'logs',
	plots: path.join('logs', 'plots'),
} as const;

const skippedSearchDirectories = new Set([
	'.cache',
	'.git',
	'.hg',
	'.svn',
	'.vscode-test',
	'node_modules',
	'out',
	'site',
]);

export async function discoverHdlProjects(
	options: ProjectDiscoveryOptions,
): Promise<ProjectDiscoveryResult> {
	const scanRequests = buildScanRequests(options);
	const candidatesByPath = new Map<string, CandidateProjectRoot>();

	for (const request of scanRequests) {
		const projectRoots = await findProjectRoots(request.rootPath, request.maxDepth);

		for (const projectRoot of projectRoots) {
			const candidate = getOrCreateCandidate(candidatesByPath, projectRoot);
			candidate.sources.add(request.source);

			if (request.workspaceFolderPath !== undefined) {
				candidate.workspaceFolderPaths.add(request.workspaceFolderPath);
			}
		}
	}

	const projects = await Promise.all(
		Array.from(candidatesByPath.values(), async (candidate) => inspectCandidateProjectRoot(candidate)),
	);

	return {
		discovery: passiveDiscoveryExecution,
		scannedRootPaths: Array.from(new Set(scanRequests.map((request) => request.rootPath))).sort(),
		projects: projects
			.filter((project): project is HdlProjectModel => project !== undefined)
			.sort((left, right) => left.rootPath.localeCompare(right.rootPath)),
	};
}

export async function inspectProjectRoot(rootPath: string): Promise<HdlProjectModel | undefined> {
	return inspectCandidateProjectRoot(createCandidate(path.resolve(rootPath)));
}

async function inspectCandidateProjectRoot(
	candidateRoot: CandidateProjectRoot,
): Promise<HdlProjectModel | undefined> {
	const rootPath = candidateRoot.rootPath;
	const makefilePath = resolveProjectPath(rootPath, projectRelativePaths.makefile);
	const hasMakefile = await isFile(makefilePath);
	const waveformSpecs = await directoryCapability(
		rootPath,
		projectRelativePaths.waveformSpecs,
	);
	const schematicSpecs = await directoryCapability(
		rootPath,
		projectRelativePaths.schematicSpecs,
	);

	if (!hasMakefile || (!waveformSpecs.available && !schematicSpecs.available)) {
		return undefined;
	}

	return {
		rootPath,
		makefilePath,
		sources: Array.from(candidateRoot.sources).sort(),
		workspaceFolderPaths: Array.from(candidateRoot.workspaceFolderPaths).sort(),
		dependencyScript: await fileCapability(rootPath, projectRelativePaths.dependencyScript),
		specs: {
			waveform: waveformSpecs,
			schematic: schematicSpecs,
		},
		buildDirectories: {
			ghdl: await directoryCapability(rootPath, projectRelativePaths.ghdlBuild),
			waves: await directoryCapability(rootPath, projectRelativePaths.wavesBuild),
			schematics: await directoryCapability(rootPath, projectRelativePaths.schematicBuild),
			csv: await directoryCapability(rootPath, projectRelativePaths.csvBuild),
		},
		artifactDirectories: {
			waveformSvgs: await directoryCapability(rootPath, projectRelativePaths.waveformSvgs),
			schematicSvgs: await directoryCapability(rootPath, projectRelativePaths.schematicSvgs),
			logs: await directoryCapability(rootPath, projectRelativePaths.logs),
			plots: await directoryCapability(rootPath, projectRelativePaths.plots),
		},
		discovery: passiveDiscoveryExecution,
	};
}

function buildScanRequests(options: ProjectDiscoveryOptions): ScanRequest[] {
	const maxDepth = Math.max(0, options.maxSearchDepth ?? defaultMaxSearchDepth);
	const workspaceFolderPaths = (options.workspaceFolderPaths ?? [])
		.map((workspaceFolderPath) => path.resolve(workspaceFolderPath));
	const requests: ScanRequest[] = workspaceFolderPaths.map((workspaceFolderPath) => ({
		rootPath: workspaceFolderPath,
		source: 'workspaceFolder',
		workspaceFolderPath,
		maxDepth,
	}));

	for (const configuredRootPath of options.configuredRootPaths ?? []) {
		const resolvedRootPaths = resolveConfiguredRootPath(
			configuredRootPath,
			workspaceFolderPaths,
		);

		for (const resolvedRootPath of resolvedRootPaths) {
			requests.push({
				rootPath: resolvedRootPath,
				source: 'configuredRoot',
				workspaceFolderPath: findContainingWorkspaceFolder(
					resolvedRootPath,
					workspaceFolderPaths,
				),
				maxDepth: 0,
			});
		}
	}

	return requests;
}

function resolveConfiguredRootPath(
	configuredRootPath: string,
	workspaceFolderPaths: readonly string[],
): string[] {
	if (path.isAbsolute(configuredRootPath)) {
		return [path.resolve(configuredRootPath)];
	}

	if (workspaceFolderPaths.length === 0) {
		return [path.resolve(configuredRootPath)];
	}

	return workspaceFolderPaths.map((workspaceFolderPath) => (
		path.resolve(workspaceFolderPath, configuredRootPath)
	));
}

function findContainingWorkspaceFolder(
	projectRootPath: string,
	workspaceFolderPaths: readonly string[],
): string | undefined {
	return workspaceFolderPaths.find((workspaceFolderPath) => {
		const relativePath = path.relative(workspaceFolderPath, projectRootPath);
		return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
	});
}

async function findProjectRoots(rootPath: string, maxDepth: number): Promise<string[]> {
	if (!(await isDirectory(rootPath))) {
		return [];
	}

	return findProjectRootsBelow(rootPath, maxDepth, 0);
}

async function findProjectRootsBelow(
	rootPath: string,
	maxDepth: number,
	currentDepth: number,
): Promise<string[]> {
	const inspectedProject = await inspectProjectRoot(rootPath);

	if (inspectedProject !== undefined) {
		return [inspectedProject.rootPath];
	}

	if (currentDepth >= maxDepth) {
		return [];
	}

	const entries = await readDirectoryEntries(rootPath);
	const projectRoots: string[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory() || skippedSearchDirectories.has(entry.name)) {
			continue;
		}

		const childProjectRoots = await findProjectRootsBelow(
			path.join(rootPath, entry.name),
			maxDepth,
			currentDepth + 1,
		);
		projectRoots.push(...childProjectRoots);
	}

	return projectRoots;
}

function getOrCreateCandidate(
	candidatesByPath: Map<string, CandidateProjectRoot>,
	rootPath: string,
): CandidateProjectRoot {
	const existingCandidate = candidatesByPath.get(rootPath);

	if (existingCandidate !== undefined) {
		return existingCandidate;
	}

	const candidate = createCandidate(rootPath);
	candidatesByPath.set(rootPath, candidate);
	return candidate;
}

function createCandidate(rootPath: string): CandidateProjectRoot {
	return {
		rootPath,
		sources: new Set(),
		workspaceFolderPaths: new Set(),
	};
}

async function fileCapability(
	rootPath: string,
	relativePath: string,
): Promise<ProjectCapability> {
	const fullPath = resolveProjectPath(rootPath, relativePath);
	const available = await isFile(fullPath);

	return {
		available,
		path: fullPath,
		status: available ? 'present' : 'missingOptionalFile',
	};
}

async function directoryCapability(
	rootPath: string,
	relativePath: string,
): Promise<ProjectCapability> {
	const fullPath = resolveProjectPath(rootPath, relativePath);
	const available = await isDirectory(fullPath);

	return {
		available,
		path: fullPath,
		status: available ? 'present' : 'missingOptionalDirectory',
	};
}

function resolveProjectPath(rootPath: string, relativePath: string): string {
	return path.join(rootPath, relativePath);
}

async function isFile(candidatePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(candidatePath);
		return stats.isFile();
	} catch {
		return false;
	}
}

async function isDirectory(candidatePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(candidatePath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function readDirectoryEntries(rootPath: string): Promise<Dirent[]> {
	try {
		return await fs.readdir(rootPath, { withFileTypes: true });
	} catch {
		return [];
	}
}
