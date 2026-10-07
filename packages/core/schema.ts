import type { EvaluationConfig } from './index.ts';

/** Public JSON Schema for evaluation manifests. Keep this versioned with the bundle format. */
export const evaluationConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://zerberus.dev/orcheval/schemas/evaluation-config-v1.json',
  type: 'object', additionalProperties: false,
  properties: {
    version: { const: 1 }, name: { type: 'string', minLength: 1 }, profileId: { type: 'string', minLength: 1 },
    targets: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
    gates: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
    metrics: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
    repetitions: { type: 'integer', minimum: 1 }, warmup: { type: 'integer', minimum: 0 }, seed: { type: 'integer' },
    concurrency: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } },
    faults: { type: 'array', items: { type: 'string', minLength: 1 } }, outputDir: { type: 'string', minLength: 1 },
  },
} as const;

/** Runtime structural validation mirrors the published schema without accepting unknown keys. */
export function schemaErrors(config: EvaluationConfig): string[] {
  const allowed = new Set(Object.keys(evaluationConfigSchema.properties));
  const errors = Object.keys(config).filter((key) => !allowed.has(key)).map((key) => `Unknown configuration property: ${key}.`);
  const strings = ['name', 'profileId', 'outputDir'] as const;
  for (const key of strings) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim())) errors.push(`${key} must be a non-empty string.`);
  for (const key of ['targets', 'gates', 'metrics', 'faults'] as const) if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key].some((value) => typeof value !== 'string' || !value.trim()))) errors.push(`${key} must be an array of non-empty strings.`);
  return errors;
}
