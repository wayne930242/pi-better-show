import type { Recommended } from "./types.ts";

/** Helpers that turn parsed YAML into typed block data; each throws an `Error` that says what the author wrote wrong. */

export type Raw = Record<string, unknown>;

export function record(value: unknown, what: string): Raw {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`each ${what} must be a mapping`);
  return value as Raw;
}

/** A block's items: a YAML list, or a mapping holding the list under `key`. */
export function itemsOf(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data;
  const found = data && typeof data === "object" ? (data as Raw)[key] : undefined;
  if (!Array.isArray(found)) throw new Error(`expected a YAML list, or a mapping with a \`${key}\` list`);
  return found;
}

/** The block's own mapping (title, submit, ...) when it is one; a bare list has none. */
export function mappingOf(data: unknown): Raw {
  return data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Raw) : {};
}

/** A text field: a scalar becomes its trimmed text, empty is absent, a list or mapping is an error. */
export function text(value: unknown, what: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") throw new Error(`${what} must be text`);
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

export function requiredText(value: unknown, what: string): string {
  const result = text(value, what);
  if (result === undefined) throw new Error(`${what} is required`);
  return result;
}

/** A list of texts: a YAML list, or one string split at `;`. */
export function list(value: unknown, what: string): string[] {
  if (value === undefined || value === null) return [];
  const entries = Array.isArray(value)
    ? value.map((entry) => text(entry, what))
    : String(value)
        .split(";")
        .map((entry) => entry.trim());
  return entries.filter((entry): entry is string => entry !== undefined && entry !== "");
}

/** `true`, or the label given; anything falsy means not set. */
export function recommended(value: unknown): Recommended | undefined {
  if (value === true) return true;
  if (!value || typeof value === "object") return undefined;
  return String(value);
}

export function flag(value: unknown, what: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${what} must be true or false`);
  return value;
}

export function positiveNumber(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${what} must be a positive number`);
  return number;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T | undefined {
  if (value === undefined || value === null) return undefined;
  const found = allowed.find((entry) => entry === String(value));
  if (found === undefined) throw new Error(`${what} must be one of ${allowed.join(", ")}`);
  return found;
}

/** A scalar object entry or a bare scalar, as the mapping the schemas read. */
export function entryOf(entry: unknown, scalarKey: string, what: string): Raw {
  if (entry !== null && typeof entry === "object") return record(entry, what);
  return { [scalarKey]: entry };
}
