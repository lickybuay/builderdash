/**
 * New content blocks and their required fields.
 *
 * EmDash creates a block with its fields' defaults only, and the server
 * rejects a block whose required fields are empty, or whose required list has
 * fewer items than its minimum. A block added from the builder's palette
 * would then block every save, so it is created already valid: required
 * text shows its label, a required select its first option, a required list
 * as many sample items as its minimum.
 */

/** A block type field as the manifest and the schema API describe it. */
export interface BlockFieldDef {
	slug: string;
	label?: string;
	type: string;
	required?: boolean;
	defaultValue?: unknown;
	/** Select choices: here on repeater sub-fields, under `validation` on fields. */
	options?: unknown[];
	validation?: {
		options?: unknown[];
		minItems?: number;
		maxItems?: number;
		subFields?: BlockFieldDef[];
		[key: string]: unknown;
	};
}

export interface BlockTypeDef {
	slug: string;
	label: string;
	category?: string;
	description?: string;
	currentVersion: number;
	versions: Array<{ version: number; fields: BlockFieldDef[] }>;
}

export type NewBlock = Record<string, unknown> & { _type: string; _version: number; _key: string };

export function fieldsOf(type: BlockTypeDef, version = type.currentVersion): BlockFieldDef[] {
	return (
		type.versions.find((candidate) => candidate.version === version)?.fields ??
		type.versions.find((candidate) => candidate.version === type.currentVersion)?.fields ??
		[]
	);
}

/** A block of `type` that passes the server's required-field rules. */
export function createBlockValue(type: BlockTypeDef, key: string): NewBlock {
	const block: NewBlock = { _type: type.slug, _version: type.currentVersion, _key: key };
	Object.assign(block, valuesFor(fieldsOf(type)));
	return block;
}

function valuesFor(fields: BlockFieldDef[]): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const field of fields) {
		const value = initialValue(field);
		if (value !== undefined) values[field.slug] = value;
	}
	return values;
}

function initialValue(field: BlockFieldDef): unknown {
	if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
	if (!field.required) return undefined;
	switch (field.type) {
		case "string":
		case "text":
			return field.label || field.slug;
		case "select": {
			const first = optionsOf(field)[0];
			if (typeof first === "string") return first;
			if (first && typeof first === "object" && "value" in first) return (first as { value: unknown }).value;
			return undefined;
		}
		case "number":
		case "integer":
			return 0;
		case "boolean":
			return false;
		case "repeater": {
			const count = Math.max(1, field.validation?.minItems ?? 1);
			return Array.from({ length: count }, () => valuesFor(field.validation?.subFields ?? []));
		}
		default:
			return undefined;
	}
}

/** A select field's choices, wherever the schema puts them. */
export function optionsOf(field: BlockFieldDef): unknown[] {
	return field.validation?.options ?? field.options ?? [];
}

/** The first required field left empty, as `field` or `field[0].sub`. */
export function missingRequired(block: Record<string, unknown>, fields: BlockFieldDef[]): string | null {
	for (const field of fields) {
		const value = block[field.slug];
		if (field.type === "repeater") {
			const items = Array.isArray(value) ? value : [];
			const min = field.validation?.minItems ?? (field.required ? 1 : 0);
			if (items.length < min) return field.slug;
			for (const [at, item] of items.entries()) {
				const inner = missingRequired((item ?? {}) as Record<string, unknown>, field.validation?.subFields ?? []);
				if (inner) return `${field.slug}[${at}].${inner}`;
			}
			continue;
		}
		if (field.required && (value === undefined || value === null || value === "")) return field.slug;
	}
	return null;
}
