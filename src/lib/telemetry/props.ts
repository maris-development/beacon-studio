/**
 * Keeps one props object inside the server limit.
 *
 * The server drops the whole object when the encoded size passes its cap. An
 * oversized object therefore loses every field. This module cuts the object
 * down first, in steps, and keeps the fields that carry the most meaning.
 *
 * The steps run in order. The first result that fits wins.
 */

/** The client budget, in bytes. It stays below the server cap of 8000. */
const MAX_PROPS_BYTES = 7000;

/** The longest column list that one event carries. */
const MAX_COLUMNS = 25;

/** The longest filter list that one event carries. */
const MAX_FILTERS = 20;

export type Props = Record<string, unknown>;

/** The encoded size of one value, in bytes. */
function byteSize(value: unknown): number {
	try {
		const text = JSON.stringify(value);

		if (!text) return 0;

		return new TextEncoder().encode(text).length;
	} catch {
		// A circular object cannot be encoded. Treat it as too large.
		return Number.MAX_SAFE_INTEGER;
	}
}

/** Cuts the column list and keeps the count that sits beside it. */
function cutColumns(props: Props): Props {
	const columns = props.columns;

	if (!Array.isArray(columns) || columns.length <= MAX_COLUMNS) return props;

	return { ...props, columns: columns.slice(0, MAX_COLUMNS), columnsTruncated: true };
}

/** Drops the value of every filter. The column and the kind stay. */
function stripFilterValues(props: Props): Props {
	const filters = props.filters;

	if (!Array.isArray(filters)) return props;

	const stripped = filters.map((filter) => {
		if (!filter || typeof filter !== 'object') return filter;

		const { column, kind } = filter as { column?: unknown; kind?: unknown };

		return { column, kind };
	});

	return { ...props, filters: stripped, filterValuesTruncated: true };
}

/** Cuts the filter list and keeps the count that sits beside it. */
function cutFilters(props: Props): Props {
	const filters = props.filters;

	if (!Array.isArray(filters) || filters.length <= MAX_FILTERS) return props;

	return { ...props, filters: filters.slice(0, MAX_FILTERS), filtersTruncated: true };
}

/** Drops the column list. The count stays. */
function dropColumns(props: Props): Props {
	if (!('columns' in props)) return props;

	const rest: Props = { ...props, columnsTruncated: true };

	delete rest.columns;

	return rest;
}

/** Drops the filter list. The count and the kind tally stay. */
function dropFilters(props: Props): Props {
	if (!('filters' in props)) return props;

	const rest: Props = { ...props, filtersTruncated: true };

	delete rest.filters;

	return rest;
}

/** Keeps the scalar fields only. Every list and every object goes. */
function scalarsOnly(props: Props): Props {
	const kept: Props = {};

	for (const [key, value] of Object.entries(props)) {
		const type = typeof value;

		if (type === 'string' || type === 'number' || type === 'boolean') kept[key] = value;
	}

	kept.propsTruncated = true;

	return kept;
}

const STEPS = [cutColumns, stripFilterValues, cutFilters, dropColumns, dropFilters, scalarsOnly];

/**
 * Returns a props object that the server accepts, or null when there is nothing
 * to send. The caller passes the result straight to the event.
 */
export function fitProps(props: Props | null | undefined): Props | null {
	if (!props) return null;

	if (Object.keys(props).length === 0) return null;

	let current = props;

	if (byteSize(current) <= MAX_PROPS_BYTES) return current;

	for (const step of STEPS) {
		current = step(current);

		if (byteSize(current) <= MAX_PROPS_BYTES) return current;
	}

	// Nothing fits. Report that a value was there, so the row stays readable.
	return { propsTruncated: true };
}
