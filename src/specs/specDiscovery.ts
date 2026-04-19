import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
	discoverHdlProjects,
	passiveDiscoveryExecution,
	type HdlProjectModel,
} from '../discovery/projectDiscovery';

export const specDiscoveryExecution = passiveDiscoveryExecution;

export type SpecKind = 'waveform' | 'schematic';
export type SpecStatus = 'valid' | 'invalid';
export type SpecDiscoveryOutcome = 'discovered' | 'empty' | 'noProjects';

export interface SpecDiscoveryOptions {
	readonly workspaceFolderPaths: readonly string[];
	readonly configuredRootPaths?: readonly string[];
	readonly projects?: readonly HdlProjectModel[];
}

export interface DiscoveredSpec {
	readonly id: string;
	readonly kind: SpecKind;
	readonly status: SpecStatus;
	readonly name: string;
	readonly fileName: string;
	readonly filePath: string;
	readonly projectRootPath: string;
	readonly relativePath: string;
	readonly errorMessage?: string;
}

export interface ProjectSpecDiscoveryResult {
	readonly project: HdlProjectModel;
	readonly specs: Record<SpecKind, readonly DiscoveredSpec[]>;
}

export interface SpecDiscoveryResult {
	readonly outcome: SpecDiscoveryOutcome;
	readonly discovery: typeof specDiscoveryExecution;
	readonly projects: readonly ProjectSpecDiscoveryResult[];
	readonly message: string;
}

export async function discoverWorkspaceSpecs(
	options: SpecDiscoveryOptions,
): Promise<SpecDiscoveryResult> {
	const projects = options.projects ?? (await discoverHdlProjects({
		workspaceFolderPaths: options.workspaceFolderPaths,
		configuredRootPaths: options.configuredRootPaths,
	})).projects;

	if (projects.length === 0) {
		return {
			outcome: 'noProjects',
			discovery: specDiscoveryExecution,
			projects: [],
			message: 'No HDL projects were found for spec discovery.',
		};
	}

	const projectResults = await Promise.all(
		projects.map(async (project) => discoverProjectSpecs(project)),
	);
	const sortedProjectResults = projectResults
		.sort((left, right) => left.project.rootPath.localeCompare(right.project.rootPath));
	const specCount = sortedProjectResults.reduce((count, projectResult) => (
		count
			+ projectResult.specs.waveform.length
			+ projectResult.specs.schematic.length
	), 0);

	if (specCount === 0) {
		return {
			outcome: 'empty',
			discovery: specDiscoveryExecution,
			projects: sortedProjectResults,
			message: 'No waveform or schematic spec JSON files were found.',
		};
	}

	return {
		outcome: 'discovered',
		discovery: specDiscoveryExecution,
		projects: sortedProjectResults,
		message: `Discovered ${specCount} HDL spec${specCount === 1 ? '' : 's'}.`,
	};
}

export function createSpecItemId(
	projectRootPath: string,
	kind: SpecKind,
	filePath: string,
): string {
	return [
		'hdl-dev.spec',
		kind,
		path.resolve(projectRootPath),
		path.resolve(filePath),
	].join('|');
}

async function discoverProjectSpecs(
	project: HdlProjectModel,
): Promise<ProjectSpecDiscoveryResult> {
	const specs = {
		waveform: await discoverSpecsForKind(project, 'waveform'),
		schematic: await discoverSpecsForKind(project, 'schematic'),
	};

	return {
		project,
		specs,
	};
}

async function discoverSpecsForKind(
	project: HdlProjectModel,
	kind: SpecKind,
): Promise<readonly DiscoveredSpec[]> {
	const capability = project.specs[kind];

	if (!capability.available) {
		return [];
	}

	const entries = await readDirectoryEntries(capability.path);
	const jsonFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => path.join(capability.path, entry.name))
		.sort((left, right) => left.localeCompare(right));

	return Promise.all(
		jsonFiles.map(async (filePath) => readSpecFile(project.rootPath, kind, filePath)),
	);
}

async function readSpecFile(
	projectRootPath: string,
	kind: SpecKind,
	filePath: string,
): Promise<DiscoveredSpec> {
	const commonFields = {
		id: createSpecItemId(projectRootPath, kind, filePath),
		kind,
		name: path.basename(filePath, '.json'),
		fileName: path.basename(filePath),
		filePath,
		projectRootPath,
		relativePath: path.relative(projectRootPath, filePath),
	};

	try {
		JSON.parse(await fs.readFile(filePath, 'utf8'));
		return {
			...commonFields,
			status: 'valid',
		};
	} catch (error) {
		return {
			...commonFields,
			status: 'invalid',
			errorMessage: formatJsonError(error),
		};
	}
}

async function readDirectoryEntries(directoryPath: string): Promise<Dirent[]> {
	try {
		return await fs.readdir(directoryPath, { withFileTypes: true });
	} catch {
		return [];
	}
}

function formatJsonError(error: unknown): string {
	if (error instanceof Error) {
		return `Invalid JSON: ${error.message.replace(/\s+/g, ' ')}`;
	}

	return 'Invalid JSON: unable to parse file.';
}
