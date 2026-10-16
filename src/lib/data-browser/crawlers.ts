import { message, type Message } from '@/i18n';
import { normalizeFolder } from './folders';

export const CRAWLER_FORMATS = [
	{ value: 'parquet', label: 'Parquet' },
	{ value: 'nc', label: 'NetCDF' },
	{ value: 'csv', label: 'CSV' },
	{ value: 'zarr', label: 'Zarr' },
	{ value: 'atlas', label: 'Atlas' },
	{ value: 'arrow', label: 'Arrow' },
	{ value: 'odv', label: 'ODV' },
	{ value: 'tiff', label: 'GeoTIFF' },
	{ value: 'bbf', label: 'BBF' }
];

export type TableNaming = 'leaf_prefix' | 'crawler_prefixed';

export interface Crawler {
	name: string;
	targetPrefix: string;
	/** `null` means every format. */
	formatFilter: string[] | null;
	tableNaming: TableNaming;
	detectPartitions: boolean;
	/** `null` means only on Run. */
	scheduleSecs: number | null;
	/** The server does not use it yet. The form keeps it on Edit. */
	eventDriven: boolean;
	options: Record<string, string>;
}

/** Reads `GET /api/admin/crawlers`. */
export function parseCrawlers(raw: unknown): Crawler[] {
	if (!Array.isArray(raw)) return [];

	const result: Crawler[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		if (typeof record.name !== 'string' || typeof record.target_prefix !== 'string') continue;

		let formatFilter: string[] | null = null;
		if (Array.isArray(record.format_filter)) {
			formatFilter = record.format_filter.filter(
				(value): value is string => typeof value === 'string'
			);
		}

		let tableNaming: TableNaming = 'leaf_prefix';
		if (record.table_naming === 'crawler_prefixed') tableNaming = 'crawler_prefixed';

		let scheduleSecs: number | null = null;
		if (typeof record.schedule_secs === 'number') scheduleSecs = record.schedule_secs;

		const options: Record<string, string> = {};
		if (record.options && typeof record.options === 'object') {
			for (const [key, value] of Object.entries(record.options as Record<string, unknown>)) {
				options[key] = String(value);
			}
		}

		result.push({
			name: record.name,
			targetPrefix: record.target_prefix,
			formatFilter,
			tableNaming,
			detectPartitions: record.detect_partitions !== false,
			scheduleSecs,
			eventDriven: record.event_driven === true,
			options
		});
	}

	return result;
}

export const CRAWLER_DOCS_URL =
	'https://maris-development.github.io/beacon/docs/latest/server/crawlers.html';

export interface CrawlerForm {
	name: string;
	folder: string;
	formats: string[];
	naming: TableNaming;
	detectPartitions: boolean;
	/** Seconds between runs. `null` means only on Run. */
	timer: number | null;
	/** One `key=value` for each line. */
	optionsText: string;
	eventDriven: boolean;
}

export function emptyCrawlerForm(): CrawlerForm {
	return {
		name: '',
		folder: '',
		formats: [],
		naming: 'leaf_prefix',
		detectPartitions: true,
		timer: null,
		optionsText: '',
		eventDriven: false
	};
}

export function formFromCrawler(crawler: Crawler): CrawlerForm {
	let timer: number | null = null;
	if (crawler.scheduleSecs !== null && crawler.scheduleSecs > 0) timer = crawler.scheduleSecs;

	return {
		name: crawler.name,
		folder: crawler.targetPrefix,
		formats: crawler.formatFilter ?? [],
		naming: crawler.tableNaming,
		detectPartitions: crawler.detectPartitions,
		timer,
		optionsText: optionsToText(crawler.options),
		eventDriven: crawler.eventDriven
	};
}

/** Reads the options text. A later line with the same key wins. */
export function parseTableOptions(text: string): {
	options: Record<string, string>;
	errors: Message[];
} {
	const options: Record<string, string> = {};
	const errors: Message[] = [];

	text.split('\n').forEach((raw, index) => {
		const line = raw.trim();
		if (line === '') return;

		const split = line.indexOf('=');
		if (split < 0) {
			errors.push(message('dataBrowser.crawlers.error.optionEquals', { line: index + 1 }));
			return;
		}

		const key = line.slice(0, split).trim();
		if (key === '') {
			errors.push(message('dataBrowser.crawlers.error.optionKey', { line: index + 1 }));
			return;
		}

		options[key] = line.slice(split + 1).trim();
	});

	return { options, errors };
}

export function optionsToText(options: Record<string, string>): string {
	return Object.entries(options)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');
}

/** The body of `POST /api/admin/crawlers`. */
export function crawlerRequest(form: CrawlerForm, replace: boolean): Record<string, unknown> {
	let formatFilter: string[] | null = null;
	if (form.formats.length > 0) formatFilter = form.formats;

	return {
		name: form.name.trim(),
		target_prefix: normalizeFolder(form.folder),
		format_filter: formatFilter,
		table_naming: form.naming,
		detect_partitions: form.detectPartitions,
		schedule_secs: form.timer,
		event_driven: form.eventDriven,
		options: parseTableOptions(form.optionsText).options,
		replace
	};
}

const MIN_SCHEDULE_SECS = 60;

export function crawlerErrors(form: CrawlerForm): Message[] {
	const errors: Message[] = [];

	if (form.name.trim() === '') errors.push(message('dataBrowser.crawlers.error.name'));
	if (normalizeFolder(form.folder) === '') errors.push(message('dataBrowser.crawlers.error.folder'));
	if (form.timer !== null && (!Number.isInteger(form.timer) || form.timer < MIN_SCHEDULE_SECS)) {
		// Each run scans the whole folder, so a shorter period loads the node for nothing.
		errors.push(message('dataBrowser.crawlers.error.scheduleSeconds', { min: MIN_SCHEDULE_SECS }));
	}
	errors.push(...parseTableOptions(form.optionsText).errors);

	return errors;
}

export function describeSchedule(secs: number | null): Message {
	if (secs === null || secs <= 0) return message('dataBrowser.crawlers.schedule.never');
	if (secs % 3600 === 0) return message('dataBrowser.crawlers.schedule.hours', { count: secs / 3600 });
	if (secs % 60 === 0) return message('dataBrowser.crawlers.schedule.minutes', { count: secs / 60 });
	return message('dataBrowser.crawlers.schedule.seconds', { count: secs });
}

export function describeFormats(filter: string[] | null): Message {
	if (filter === null || filter.length === 0) return message('dataBrowser.crawlers.formats.all');

	const formats = filter
		.map((value) => CRAWLER_FORMATS.find((format) => format.value === value)?.label ?? value)
		.join(', ');
	return message('dataBrowser.crawlers.formats.list', { formats });
}

export function describeNaming(naming: TableNaming): Message {
	if (naming === 'crawler_prefixed') return message('dataBrowser.crawlers.naming.prefixed');
	return message('dataBrowser.crawlers.naming.leaf');
}

/** The name of a table from the chosen folder. The crawler uses each sub-folder the same way. */
export function tableNameExample(form: CrawlerForm): string {
	const parts = normalizeFolder(form.folder)
		.split('/')
		.filter((part) => part !== '');
	const leaf = parts[parts.length - 1] ?? '<folder>';

	if (form.naming === 'crawler_prefixed') return `${form.name.trim() || '<crawler>'}_${leaf}`;
	return leaf;
}

/** A cut list can miss the folder, so it counts as "has files". */
export function folderHasFiles(folder: string, paths: string[], listCut = false): boolean {
	if (listCut) return true;

	const prefix = normalizeFolder(folder);
	return paths.some((path) => path.replace(/^\/+/, '').startsWith(prefix));
}
