import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv';

const repositoryRoot = path.join(__dirname, '..', '..');

suite('Spec Schemas', () => {
	test('package contributes scoped waveform and schematic JSON validation', async () => {
		const packageJson = await readJson(path.join(repositoryRoot, 'package.json')) as PackageJson;

		assert.deepStrictEqual(packageJson.contributes.jsonValidation, [
			{
				fileMatch: ['**/docs/waveforms/specs/*.json'],
				url: './schemas/waveform-spec.schema.json',
			},
			{
				fileMatch: ['**/docs/schematics/specs/*.json'],
				url: './schemas/schematic-spec.schema.json',
			},
		]);
	});

	test('schemas compile and validate representative fixtures', async () => {
		const validators = await createSchemaValidators();
		const fixtures = [
			['waveform-gencor.json', validators.waveform],
			['waveform-fixture-alias.json', validators.waveform],
			['schematic-base.json', validators.schematic],
			['schematic-extended.json', validators.schematic],
			['schematic-fixture-alias.json', validators.schematic],
		] as const;

		for (const [fileName, validate] of fixtures) {
			const fixturePath = path.join(repositoryRoot, 'test-fixtures', 'spec-schemas', 'valid', fileName);
			assertValid(validate, await readJson(fixturePath), fileName);
		}
	});

	test('existing lightweight project specs remain valid', async () => {
		const validators = await createSchemaValidators();
		const fixtureRoot = path.join(repositoryRoot, 'test-fixtures', 'hdl-projects', 'minimal');

		assertValid(
			validators.waveform,
			await readJson(path.join(fixtureRoot, 'docs', 'waveforms', 'specs', 'timer-wave.json')),
			'test-fixtures/hdl-projects/minimal/docs/waveforms/specs/timer-wave.json',
		);
		assertValid(
			validators.schematic,
			await readJson(path.join(fixtureRoot, 'docs', 'schematics', 'specs', 'timer-core.json')),
			'test-fixtures/hdl-projects/minimal/docs/schematics/specs/timer-core.json',
		);
	});

	test('schemas reject representative invalid specs', async () => {
		const validators = await createSchemaValidators();
		const fixtures = [
			['waveform-missing-signals.json', validators.waveform],
			['waveform-bad-signals.json', validators.waveform],
			['schematic-bad-glue-depth.json', validators.schematic],
		] as const;

		for (const [fileName, validate] of fixtures) {
			const fixturePath = path.join(repositoryRoot, 'test-fixtures', 'spec-schemas', 'invalid', fileName);
			assertInvalid(validate, await readJson(fixturePath), fileName);
		}
	});
});

interface PackageJson {
	readonly contributes: {
		readonly jsonValidation: readonly SchemaContribution[];
	};
}

interface SchemaContribution {
	readonly fileMatch: readonly string[];
	readonly url: string;
}

interface SchemaValidators {
	readonly waveform: ValidateFunction;
	readonly schematic: ValidateFunction;
}

async function createSchemaValidators(): Promise<SchemaValidators> {
	const ajv = new Ajv({ allErrors: true });
	return {
		waveform: ajv.compile(await readJson(path.join(repositoryRoot, 'schemas', 'waveform-spec.schema.json')) as AnySchema),
		schematic: ajv.compile(await readJson(path.join(repositoryRoot, 'schemas', 'schematic-spec.schema.json')) as AnySchema),
	};
}

async function readJson(filePath: string): Promise<unknown> {
	return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function assertValid(validate: ValidateFunction, value: unknown, label: string): void {
	assert.strictEqual(
		validate(value),
		true,
		`${label} should be valid: ${formatErrors(validate.errors)}`,
	);
}

function assertInvalid(validate: ValidateFunction, value: unknown, label: string): void {
	assert.strictEqual(
		validate(value),
		false,
		`${label} should be invalid`,
	);
	assert.notStrictEqual(validate.errors, null, `${label} should report validation errors`);
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
	return errors?.map((error) => {
		const location = error.instancePath === '' ? '/' : error.instancePath;
		return `${location} ${error.message ?? 'failed validation'}`;
	}).join('; ') ?? 'no errors reported';
}
