import { z, type ZodType } from 'zod';

export type Json = Record<string, unknown>;

/** Drops regexes that only restate a `format` (they make the rendered docs unreadable). */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (node === null || typeof node !== 'object') return node;
  const source = node as Json;
  const out: Json = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'pattern' && (source['format'] === 'uuid' || source['format'] === 'date')) continue;
    if (key === 'maximum' && value === Number.MAX_SAFE_INTEGER) continue;
    out[key] = tidy(value);
  }
  return out;
}

/**
 * OpenAPI 3.0 schema generated from the SAME Zod schema the route validates with, so request
 * documentation cannot drift from behaviour. `io: 'input'` describes what clients send (before
 * transforms such as string -> Date). Cross-field `.refine` rules are not representable and are
 * described in words on the operation instead.
 */
export function fromZod(schema: ZodType): Json {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    target: 'openapi-3.0',
  }) as Json;
  delete json['$schema'];
  return tidy(json) as Json;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description?: string;
  schema: Json;
}

/** One OpenAPI parameter per property of a Zod object schema (path or query). */
export function parametersFrom(
  schema: ZodType,
  location: 'path' | 'query',
  descriptions: Record<string, string> = {},
): ParameterObject[] {
  const json = fromZod(schema);
  const properties = (json['properties'] ?? {}) as Record<string, Json>;
  const required = new Set((json['required'] ?? []) as string[]);
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    ...(descriptions[name] && { description: descriptions[name] }),
    schema: propertySchema,
  }));
}
