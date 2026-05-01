import { createHash } from 'node:crypto';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function stableHash(value: JsonValue): string {
  const hash = createHash('sha256');
  hash.update(stableStringify(value));
  return hash.digest('hex');
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}
