/**
 * AI Output Parser — Extracts and validates JSON from AI text responses
 *
 * Combines regex-based JSON extraction with Zod schema validation.
 * Falls back gracefully on parse/validation failure.
 */

import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('ai-output-parser');

export type ParseResult<T> =
  | { success: true; data: T; raw: string }
  | { success: false; error: string; raw: string };

/** Minimal Zod-compatible schema interface (avoids direct zod dependency) */
type SafeParsable<T> = {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
};

/**
 * Extract JSON from AI text and validate against a Zod schema.
 *
 * 1. Extracts JSON block via regex (outermost `{...}`)
 * 2. JSON.parse
 * 3. Zod safeParse validation
 *
 * On failure: logs warning and returns error result (caller decides fallback).
 */
export function parseAiJson<T>(
  text: string,
  schema: SafeParsable<T>,
  context?: { workflow?: string; field?: string }
): ParseResult<T> {
  // Step 1: Extract JSON block
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const error = 'No JSON block found in AI response';
    logger.warn({ ...context, textLength: text.length }, error);
    return { success: false, error, raw: text };
  }

  const rawJson = jsonMatch[0];

  // Step 2: JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (parseErr) {
    const error = `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
    logger.warn({ ...context, rawJsonLength: rawJson.length }, error);
    return { success: false, error, raw: rawJson };
  }

  // Step 3: Zod validation
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const error = `Schema validation failed: ${result.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ')}`;
    logger.warn({ ...context, issues: result.error.issues.length }, error);
    return { success: false, error, raw: rawJson };
  }

  return { success: true, data: result.data, raw: rawJson };
}
