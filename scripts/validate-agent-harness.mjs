#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const requiredPaths = [
	['file', 'AGENTS.md'],
	['file', 'ARCHITECTURE.md'],
	['file', 'docs/agent/README.md'],
	['file', 'docs/agent/issue-workflow.md'],
	['file', 'docs/agent/validation.md'],
	['file', 'docs/plans/README.md'],
	['dir', 'docs/plans/active'],
	['dir', 'docs/plans/completed'],
	['file', 'docs/plans/completed/README.md'],
	['file', 'docs/plans/templates/issue-plan.md'],
	['file', 'docs/quality/golden-principles.md'],
	['file', 'docs/quality/tech-debt-tracker.md'],
	['file', 'docs/design/index.md'],
	['file', 'docs/workflows/index.md'],
	['file', 'docs/references/index.md'],
	['file', 'docs/evidence/README.md'],
	['file', '.agents/skills/hdl-dev-issue-work/SKILL.md'],
	['file', 'test-fixtures/hdl-projects/minimal/Makefile'],
	['file', 'test-fixtures/hdl-projects/minimal/scripts/deps.sh'],
	['file', 'scripts/validate-agent-harness.mjs'],
];

for (const [kind, relativePath] of requiredPaths) {
	await checkPath(kind, relativePath);
}

await checkAgentsLength();
await checkSkillFrontmatter();
await checkMarkdownLinks();
await checkDocsNavCoverage();

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`[agent-harness] ${error}`);
	}
	process.exit(1);
}

console.log('[agent-harness] ok');

async function checkPath(kind, relativePath) {
	const fullPath = path.join(root, relativePath);
	try {
		const stat = await fs.stat(fullPath);
		if (kind === 'file' && !stat.isFile()) {
			errors.push(`${relativePath} must be a file`);
		}
		if (kind === 'dir' && !stat.isDirectory()) {
			errors.push(`${relativePath} must be a directory`);
		}
	} catch {
		errors.push(`missing required ${kind}: ${relativePath}`);
	}
}

async function checkAgentsLength() {
	const content = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
	const lineCount = content.trimEnd().split('\n').length;
	if (lineCount > 140) {
		errors.push(`AGENTS.md should stay concise; found ${lineCount} lines, expected 140 or fewer`);
	}
}

async function checkSkillFrontmatter() {
	const skillPath = path.join(root, '.agents/skills/hdl-dev-issue-work/SKILL.md');
	const content = await fs.readFile(skillPath, 'utf8');
	if (!content.startsWith('---\n')) {
		errors.push('.agents/skills/hdl-dev-issue-work/SKILL.md must start with YAML frontmatter');
		return;
	}
	if (!/^name:\s*hdl-dev-issue-work$/m.test(content)) {
		errors.push('.agents/skills/hdl-dev-issue-work/SKILL.md must declare name: hdl-dev-issue-work');
	}
	if (!/^description:\s*.+$/m.test(content)) {
		errors.push('.agents/skills/hdl-dev-issue-work/SKILL.md must declare a description');
	}
}

async function checkMarkdownLinks() {
	const markdownFiles = await findMarkdownFiles(root);
	for (const filePath of markdownFiles) {
		const content = await fs.readFile(filePath, 'utf8');
		const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
		const linkPattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
		for (const match of withoutCodeBlocks.matchAll(linkPattern)) {
			const destination = match[1].trim();
			const target = parseMarkdownDestination(destination);
			if (target === undefined || target === '' || isExternalTarget(target)) {
				continue;
			}

			const targetPath = target.split('#')[0];
			if (targetPath === '') {
				continue;
			}

			const resolved = path.resolve(path.dirname(filePath), decodeURI(targetPath));
			try {
				await fs.stat(resolved);
			} catch {
				errors.push(`${relative(filePath)} links to missing path: ${target}`);
			}
		}
	}
}

async function checkDocsNavCoverage() {
	const mkdocs = await fs.readFile(path.join(root, 'mkdocs.yml'), 'utf8');
	const docsFiles = await findMarkdownFiles(path.join(root, 'docs'));
	for (const filePath of docsFiles) {
		const docsRelativePath = relative(path.relative(path.join(root, 'docs'), filePath));
		if (!mkdocs.includes(docsRelativePath)) {
			errors.push(`mkdocs.yml does not include docs page: ${docsRelativePath}`);
		}
	}
}

async function findMarkdownFiles(startPath) {
	const results = [];
	await walk(startPath, results);
	return results.sort((left, right) => left.localeCompare(right));
}

async function walk(currentPath, results) {
	const entries = await fs.readdir(currentPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(currentPath, entry.name);
		if (entry.isDirectory()) {
			if (shouldSkipDirectory(entry.name)) {
				continue;
			}
			await walk(fullPath, results);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith('.md')) {
			results.push(fullPath);
		}
	}
}

function shouldSkipDirectory(name) {
	return [
		'.cache',
		'.git',
		'.vscode-test',
		'node_modules',
		'out',
		'site',
	].includes(name);
}

function parseMarkdownDestination(destination) {
	if (destination.startsWith('<') && destination.endsWith('>')) {
		return destination.slice(1, -1);
	}
	const match = /^(\S+)/.exec(destination);
	return match?.[1];
}

function isExternalTarget(target) {
	return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function relative(filePath) {
	return path.relative(root, filePath).split(path.sep).join('/');
}
