import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
	discoverHdlProjects,
	passiveDiscoveryExecution,
	type HdlProjectModel,
	type ProjectCapability,
} from '../discovery/projectDiscovery';

export const artifactDiscoveryExecution = passiveDiscoveryExecution;

export type ArtifactKind =
	| 'waveDump'
	| 'waveformSvg'
	| 'schematicSvg'
	| 'schematicJson'
	| 'log'
	| 'plot'
	| 'csv';

export type ArtifactDiscoveryOutcome = 'discovered' | 'empty' | 'noProjects';

export interface ArtifactDiscoveryOptions {
	readonly workspaceFolderPaths: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly projects?: readonly HdlProjectModel[];
	readonly maxArtifactsPerGroup?: number;
}

export interface DiscoveredArtifact {
	readonly id: string;
	readonly kind: ArtifactKind;
	readonly name: string;
	readonly fileName: string;
	readonly filePath: string;
	readonly projectRootPath: string;
	readonly relativePath: string;
	readonly sizeBytes: number;
	readonly modifiedTimeMs: number;
}

export interface ArtifactGroupDiscoveryResult {
	readonly kind: ArtifactKind;
	readonly label: string;
	readonly directoryPath: string;
	readonly directoryAvailable: boolean;
	readonly emptyMessage: string;
	readonly artifacts: readonly DiscoveredArtifact[];
	readonly truncated: boolean;
}

export interface ProjectArtifactDiscoveryResult {
	readonly project: HdlProjectModel;
	readonly groups: Record<ArtifactKind, ArtifactGroupDiscoveryResult>;
}

export interface ArtifactDiscoveryResult {
	readonly outcome: ArtifactDiscoveryOutcome;
	readonly discovery: typeof artifactDiscoveryExecution;
	readonly projects: readonly ProjectArtifactDiscoveryResult[];
	readonly message: string;
}

interface ArtifactKindDefinition {
	readonly kind: ArtifactKind;
	readonly label: string;
	readonly extensions: readonly string[];
	readonly recursive: boolean;
	readonly emptyMessage: string;
	getCapability(project: HdlProjectModel): ProjectCapability;
}

const defaultMaxArtifactsPerGroup = 500;

const artifactKindDefinitions: readonly ArtifactKindDefinition[] = [
	{
		kind: 'waveDump',
		label: 'Wave Dumps',
		extensions: ['.ghw', '.fst', '.vcd'],
		recursive: false,
		emptyMessage: 'Run a testbench to produce wave dumps in build/waves.',
		getCapability: (project) => project.buildDirectories.waves,
	},
	{
		kind: 'waveformSvg',
		label: 'Waveform SVGs',
		extensions: ['.svg'],
		recursive: false,
		emptyMessage: 'Generate a waveform SVG from a waveform spec.',
		getCapability: (project) => project.artifactDirectories.waveformSvgs,
	},
	{
		kind: 'schematicSvg',
		label: 'Schematic SVGs',
		extensions: ['.svg'],
		recursive: false,
		emptyMessage: 'Generate a schematic SVG from a schematic spec.',
		getCapability: (project) => project.artifactDirectories.schematicSvgs,
	},
	{
		kind: 'schematicJson',
		label: 'Schematic JSON',
		extensions: ['.json'],
		recursive: true,
		emptyMessage: 'Generate a schematic SVG to produce intermediate schematic JSON.',
		getCapability: (project) => project.buildDirectories.schematics,
	},
	{
		kind: 'log',
		label: 'Logs',
		extensions: ['.log', '.txt'],
		recursive: true,
		emptyMessage: 'Run HDL workflows that write logs under logs.',
		getCapability: (project) => project.artifactDirectories.logs,
	},
	{
		kind: 'plot',
		label: 'Plots',
		extensions: ['.svg', '.png', '.jpg', '.jpeg', '.pdf'],
		recursive: false,
		emptyMessage: 'Run debug or analysis workflows that write plots under logs/plots.',
		getCapability: (project) => project.artifactDirectories.plots,
	},
	{
		kind: 'csv',
		label: 'CSV Outputs',
		extensions: ['.csv'],
		recursive: true,
		emptyMessage: 'Run workflows that write CSV outputs under build/csv.',
		getCapability: (project) => project.buildDirectories.csv,
	},
];

export function artifactKinds(): readonly ArtifactKind[] {
	return artifactKindDefinitions.map((definition) => definition.kind);
}

export function artifactKindLabel(kind: ArtifactKind): string {
	return artifactDefinition(kind).label;
}

export async function discoverWorkspaceArtifacts(
	options: ArtifactDiscoveryOptions,
): Promise<ArtifactDiscoveryResult> {
	const projects = options.projects ?? (await discoverHdlProjects({
		workspaceFolderPaths: options.workspaceFolderPaths,
		configuredRootPaths: options.configuredRootPaths,
	})).projects;

	if (projects.length === 0) {
		return {
			outcome: 'noProjects',
			discovery: artifactDiscoveryExecution,
			projects: [],
			message: 'No HDL projects were found for artifact discovery.',
		};
	}

	const projectResults = await Promise.all(
		projects.map(async (project) => discoverProjectArtifacts(
			project,
			Math.max(1, options.maxArtifactsPerGroup ?? defaultMaxArtifactsPerGroup),
		)),
	);
	const sortedProjectResults = projectResults
		.sort((left, right) => left.project.rootPath.localeCompare(right.project.rootPath));
	const artifactCount = sortedProjectResults.reduce((count, projectResult) => (
		count + artifactKindDefinitions.reduce((groupCount, definition) => (
			groupCount + projectResult.groups[definition.kind].artifacts.length
		), 0)
	), 0);

	if (artifactCount === 0) {
		return {
			outcome: 'empty',
			discovery: artifactDiscoveryExecution,
			projects: sortedProjectResults,
			message: 'No HDL generated artifacts were found.',
		};
	}

	return {
		outcome: 'discovered',
		discovery: artifactDiscoveryExecution,
		projects: sortedProjectResults,
		message: `Discovered ${artifactCount} HDL artifact${artifactCount === 1 ? '' : 's'}.`,
	};
}

export function createArtifactItemId(
	projectRootPath: string,
	kind: ArtifactKind,
	filePath: string,
): string {
	return [
		'hdl-dev.artifact',
		kind,
		path.resolve(projectRootPath),
		path.resolve(filePath),
	].join('|');
}

async function discoverProjectArtifacts(
	project: HdlProjectModel,
	maxArtifactsPerGroup: number,
): Promise<ProjectArtifactDiscoveryResult> {
	const groupEntries = await Promise.all(
		artifactKindDefinitions.map(async (definition) => [
			definition.kind,
			await discoverArtifactsForKind(project, definition, maxArtifactsPerGroup),
		] as const),
	);

	return {
		project,
		groups: Object.fromEntries(groupEntries) as Record<ArtifactKind, ArtifactGroupDiscoveryResult>,
	};
}

async function discoverArtifactsForKind(
	project: HdlProjectModel,
	definition: ArtifactKindDefinition,
	maxArtifacts: number,
): Promise<ArtifactGroupDiscoveryResult> {
	const capability = definition.getCapability(project);

	if (!capability.available) {
		return {
			kind: definition.kind,
			label: definition.label,
			directoryPath: capability.path,
			directoryAvailable: false,
			emptyMessage: definition.emptyMessage,
			artifacts: [],
			truncated: false,
		};
	}

	const filePaths = await collectArtifactFiles(
		capability.path,
		definition.extensions,
		definition.recursive,
		maxArtifacts + 1,
	);
	const artifacts = await Promise.all(
		filePaths.slice(0, maxArtifacts).map(async (filePath) => (
			readArtifactFile(project.rootPath, definition.kind, filePath)
		)),
	);

	return {
		kind: definition.kind,
		label: definition.label,
		directoryPath: capability.path,
		directoryAvailable: true,
		emptyMessage: definition.emptyMessage,
		artifacts: artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
		truncated: filePaths.length > maxArtifacts,
	};
}

async function collectArtifactFiles(
	directoryPath: string,
	extensions: readonly string[],
	recursive: boolean,
	maxFiles: number,
): Promise<string[]> {
	const collected: string[] = [];
	await collectArtifactFilesBelow(directoryPath, extensions, recursive, maxFiles, collected);
	return collected.sort((left, right) => left.localeCompare(right));
}

async function collectArtifactFilesBelow(
	directoryPath: string,
	extensions: readonly string[],
	recursive: boolean,
	maxFiles: number,
	collected: string[],
): Promise<void> {
	if (collected.length >= maxFiles) {
		return;
	}

	const entries = (await readDirectoryEntries(directoryPath))
		.sort((left, right) => left.name.localeCompare(right.name));

	for (const entry of entries) {
		if (collected.length >= maxFiles) {
			return;
		}

		const entryPath = path.join(directoryPath, entry.name);

		if (entry.isFile() && hasSupportedExtension(entry.name, extensions)) {
			collected.push(entryPath);
			continue;
		}

		if (recursive && entry.isDirectory()) {
			await collectArtifactFilesBelow(entryPath, extensions, recursive, maxFiles, collected);
		}
	}
}

async function readArtifactFile(
	projectRootPath: string,
	kind: ArtifactKind,
	filePath: string,
): Promise<DiscoveredArtifact> {
	const stats = await fs.stat(filePath);

	return {
		id: createArtifactItemId(projectRootPath, kind, filePath),
		kind,
		name: path.basename(filePath, path.extname(filePath)),
		fileName: path.basename(filePath),
		filePath,
		projectRootPath,
		relativePath: path.relative(projectRootPath, filePath),
		sizeBytes: stats.size,
		modifiedTimeMs: stats.mtimeMs,
	};
}

function artifactDefinition(kind: ArtifactKind): ArtifactKindDefinition {
	const definition = artifactKindDefinitions.find((candidate) => candidate.kind === kind);

	if (definition === undefined) {
		throw new Error(`Unknown artifact kind: ${kind}`);
	}

	return definition;
}

function hasSupportedExtension(fileName: string, extensions: readonly string[]): boolean {
	const extension = path.extname(fileName).toLowerCase();
	return extensions.includes(extension);
}

async function readDirectoryEntries(directoryPath: string): Promise<Dirent[]> {
	try {
		return await fs.readdir(directoryPath, { withFileTypes: true });
	} catch {
		return [];
	}
}
