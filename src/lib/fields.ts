/**
 * Custom field (board column) types + value validation.
 * Field definitions live in `board_columns`, values in `board_task_columns`.
 */

export const FIELD_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export function isFieldType(v: unknown): v is FieldType {
  return typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);
}

export type SelectOption = { id: string; label: string; color?: string };
export type FieldConfig = { options?: SelectOption[] } | null;

/**
 * MariaDB stores JSON as text and the driver returns it unparsed, so column
 * config/value come back as strings on read. These normalize either shape.
 */
export function parseConfig(raw: unknown): FieldConfig {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as FieldConfig;
    } catch {
      return null;
    }
  }
  return raw as FieldConfig;
}

export function parseValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Validate/normalize the config sent when creating or editing a field. */
export function normalizeConfig(type: FieldType, raw: unknown): FieldConfig {
  if (type !== "select" && type !== "multi_select") return null;
  const opts = (raw as { options?: unknown })?.options;
  if (!Array.isArray(opts)) return { options: [] };
  let n = 0;
  const options: SelectOption[] = [];
  for (const o of opts) {
    const label = typeof o?.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    options.push({
      id: typeof o?.id === "string" && o.id ? o.id : `o${++n}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8)}`,
      label: label.slice(0, 60),
      color: typeof o?.color === "string" ? o.color : undefined,
    });
  }
  return { options };
}

type Coerced = { ok: true; value: unknown } | { ok: false; error: string };

/** Validate + normalize a value for a given field type. Empty clears it. */
export function coerceValue(type: FieldType, raw: unknown, config: FieldConfig): Coerced {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };

  switch (type) {
    case "text":
    case "url": {
      if (typeof raw !== "string") return { ok: false, error: "Expected text" };
      if (raw.length > 2000) return { ok: false, error: "Too long" };
      return { ok: true, value: raw };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: "Expected a number" };
      return { ok: true, value: n };
    }
    case "date": {
      const d = new Date(raw as string);
      if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date" };
      return { ok: true, value: d.toISOString() };
    }
    case "checkbox":
      return { ok: true, value: Boolean(raw) };
    case "select": {
      const ids = (config?.options ?? []).map((o) => o.id);
      if (typeof raw !== "string" || !ids.includes(raw)) {
        return { ok: false, error: "Unknown option" };
      }
      return { ok: true, value: raw };
    }
    case "multi_select": {
      if (!Array.isArray(raw)) return { ok: false, error: "Expected an array" };
      const ids = new Set((config?.options ?? []).map((o) => o.id));
      return { ok: true, value: raw.filter((v) => typeof v === "string" && ids.has(v)) };
    }
  }
}
