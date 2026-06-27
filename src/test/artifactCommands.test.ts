import * as assert from 'node:assert';
import * as path from 'node:path';

import {
	runCopyArtifactPathCommand,
	runOpenArtifactCommand,
	runRevealArtifactCommand,
	type ArtifactCommandHost,
} from '../artifacts/artifactCommands';
import type { ArtifactKind, DiscoveredArtifact } from '../artifacts/artifactDiscovery';

suite('Artifact Commands', () => {
	test('opens and reveals selected artifact tree nodes', async () => {
		const artifact = createArtifact('waveformSvg', '/workspace/timer/docs/waveforms/generated/timer.svg');
		const host = new CapturingArtifactCommandHost(true);

		const opened = await runOpenArtifactCommand(host, {
			type: 'artifact',
			artifact,
		});
		const revealed = await runRevealArtifactCommand(host, artifact);

		assert.strictEqual(opened, artifact);
		assert.strictEqual(revealed, artifact);
		assert.deepStrictEqual(host.openedArtifacts, [artifact.filePath]);
		assert.deepStrictEqual(host.revealedArtifacts, [artifact.filePath]);
		assert.deepStrictEqual(host.errorMessages, []);
	});

	test('copies artifact paths without requiring a fresh artifact scan', async () => {
		const artifact = createArtifact('log', '/workspace/timer/logs/run.log');
		const host = new CapturingArtifactCommandHost(false);

		const copied = await runCopyArtifactPathCommand(host, artifact);

		assert.strictEqual(copied, artifact);
		assert.deepStrictEqual(host.copiedText, [artifact.filePath]);
		assert.deepStrictEqual(host.informationMessages, [`Copied artifact path: ${artifact.filePath}`]);
		assert.deepStrictEqual(host.errorMessages, []);
	});

	test('reports actionable errors for missing or unselected artifacts', async () => {
		const artifact = createArtifact('csv', '/workspace/timer/build/csv/missing.csv');
		const host = new CapturingArtifactCommandHost(false);

		const missing = await runOpenArtifactCommand(host, artifact);
		const unselected = await runRevealArtifactCommand(host, undefined);

		assert.strictEqual(missing, undefined);
		assert.strictEqual(unselected, undefined);
		assert.deepStrictEqual(host.openedArtifacts, []);
		assert.deepStrictEqual(host.revealedArtifacts, []);
		assert.match(host.errorMessages[0], /Refresh artifacts or regenerate it/);
		assert.match(host.errorMessages[0], /missing\.csv/);
		assert.match(host.errorMessages[1], /Select an artifact/);
	});
});

class CapturingArtifactCommandHost implements ArtifactCommandHost {
	public readonly openedArtifacts: string[] = [];
	public readonly revealedArtifacts: string[] = [];
	public readonly copiedText: string[] = [];
	public readonly errorMessages: string[] = [];
	public readonly informationMessages: string[] = [];

	public constructor(private readonly exists: boolean) {}

	public async artifactExists(): Promise<boolean> {
		return this.exists;
	}

	public async openArtifact(filePath: string): Promise<void> {
		this.openedArtifacts.push(filePath);
	}

	public async revealArtifact(filePath: string): Promise<void> {
		this.revealedArtifacts.push(filePath);
	}

	public async copyText(text: string): Promise<void> {
		this.copiedText.push(text);
	}

	public async showErrorMessage(message: string): Promise<void> {
		this.errorMessages.push(message);
	}

	public async showInformationMessage(message: string): Promise<void> {
		this.informationMessages.push(message);
	}
}

function createArtifact(kind: ArtifactKind, filePath: string): DiscoveredArtifact {
	const projectRootPath = '/workspace/timer';

	return {
		id: `artifact:${kind}:${filePath}`,
		kind,
		name: path.basename(filePath, path.extname(filePath)),
		fileName: path.basename(filePath),
		filePath,
		projectRootPath,
		relativePath: path.relative(projectRootPath, filePath),
		sizeBytes: 12,
		modifiedTimeMs: 1,
	};
}
