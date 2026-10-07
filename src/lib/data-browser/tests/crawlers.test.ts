import { describe, expect, it } from 'vitest';
import {
	crawlerErrors,
	crawlerRequest,
	describeFormats,
	describeSchedule,
	emptyCrawlerForm,
	folderHasFiles,
	formFromCrawler,
	parseCrawlers,
	tableNameExample,
	type Crawler
} from '../crawlers';

const server = {
	name: 'argo',
	target_prefix: 'argo/',
	format_filter: ['parquet', 'nc'],
	table_naming: 'crawler_prefixed',
	detect_partitions: true,
	schedule_secs: 21600,
	event_driven: true,
	options: { read_dimensions: 'lat,lon' }
};

const crawler: Crawler = {
	name: 'argo',
	targetPrefix: 'argo/',
	formatFilter: ['parquet', 'nc'],
	tableNaming: 'crawler_prefixed',
	detectPartitions: true,
	scheduleSecs: 21600,
	eventDriven: true,
	options: { read_dimensions: 'lat,lon' }
};

describe('parseCrawlers', () => {
	it('reads the server view and drops bad entries', () => {
		expect(parseCrawlers([server, { nope: 1 }, 'junk'])).toEqual([crawler]);
	});

	it('fills defaults for missing fields', () => {
		expect(parseCrawlers([{ name: 'x', target_prefix: 'x/' }])).toEqual([
			{
				name: 'x',
				targetPrefix: 'x/',
				formatFilter: null,
				tableNaming: 'leaf_prefix',
				detectPartitions: true,
				scheduleSecs: null,
				eventDriven: false,
				options: {}
			}
		]);
	});
});

describe('form round trip', () => {
	it('gives the same request after load and save, with replace', () => {
		const request = crawlerRequest(formFromCrawler(crawler), true);
		expect(request).toEqual({ ...server, replace: true });
	});

	it('keeps event_driven, which the form does not show', () => {
		expect(crawlerRequest(formFromCrawler(crawler), true).event_driven).toBe(true);
		expect(crawlerRequest(emptyCrawlerForm(), false).event_driven).toBe(false);
	});

	it('shows a schedule in hours when it divides by an hour, else in minutes', () => {
		expect(formFromCrawler({ ...crawler, scheduleSecs: 7200 })).toMatchObject({
			scheduled: true,
			every: 2,
			unit: 'hours'
		});
		expect(formFromCrawler({ ...crawler, scheduleSecs: 900 })).toMatchObject({
			scheduled: true,
			every: 15,
			unit: 'minutes'
		});
		expect(formFromCrawler({ ...crawler, scheduleSecs: null })).toMatchObject({ scheduled: false });
	});

	it('keeps a schedule of odd seconds exact, in seconds', () => {
		const form = formFromCrawler({ ...crawler, scheduleSecs: 90 });
		expect(form).toMatchObject({ scheduled: true, every: 90, unit: 'seconds' });
		expect(crawlerRequest(form, true).schedule_secs).toBe(90);
	});
});

describe('crawlerRequest', () => {
	it('sends null formats for none checked, no schedule, and no empty options', () => {
		const form = {
			...emptyCrawlerForm(),
			name: ' wod ',
			folder: '/wod',
			options: [{ key: ' ', value: 'x' }]
		};
		expect(crawlerRequest(form, false)).toEqual({
			name: 'wod',
			target_prefix: 'wod/',
			format_filter: null,
			table_naming: 'leaf_prefix',
			detect_partitions: true,
			schedule_secs: null,
			event_driven: false,
			options: {},
			replace: false
		});
	});
});

describe('crawlerErrors', () => {
	it('asks for a name, a folder and a schedule above zero', () => {
		const form = { ...emptyCrawlerForm(), scheduled: true, every: 0 };
		expect(crawlerErrors(form)).toEqual([
			'Enter a crawler name.',
			'Pick a folder.',
			'Enter a schedule of at least 1.'
		]);
	});

	it('refuses a schedule in seconds below one minute, and accepts 90 seconds', () => {
		const form = { ...formFromCrawler(crawler), unit: 'seconds' as const, every: 1 };
		expect(crawlerErrors(form)).toEqual(['Enter a schedule of at least 60 seconds.']);
		expect(crawlerErrors({ ...form, every: 90 })).toEqual([]);
	});

	it('accepts a complete form', () => {
		expect(crawlerErrors(formFromCrawler(crawler))).toEqual([]);
	});
});

describe('display', () => {
	it('describes a schedule', () => {
		expect(describeSchedule(null)).toBe('Only on Run');
		expect(describeSchedule(3600)).toBe('Every hour');
		expect(describeSchedule(21600)).toBe('Every 6 hours');
		expect(describeSchedule(60)).toBe('Every minute');
		expect(describeSchedule(900)).toBe('Every 15 minutes');
		expect(describeSchedule(90)).toBe('Every 90 seconds');
	});

	it('describes formats with labels', () => {
		expect(describeFormats(null)).toBe('All formats');
		expect(describeFormats(['nc', 'parquet'])).toBe('NetCDF, Parquet');
		expect(describeFormats(['xyz'])).toBe('xyz');
	});

	it('gives a table name example for both naming modes', () => {
		const form = { ...emptyCrawlerForm(), name: 'argo', folder: 'data/floats/' };
		expect(tableNameExample(form)).toBe('floats');
		expect(tableNameExample({ ...form, naming: 'crawler_prefixed' })).toBe('argo_floats');
		expect(tableNameExample({ ...form, folder: '' })).toBe('<folder>');
	});

	it('checks that a folder holds files', () => {
		expect(folderHasFiles('argo/', ['argo/a.nc'])).toBe(true);
		expect(folderHasFiles('argo', ['argos/a.nc'])).toBe(false);
		expect(folderHasFiles('', ['a.nc'])).toBe(true);
	});

	it('does not warn about an empty folder when the list is cut, and ignores a leading slash', () => {
		expect(folderHasFiles('argo/', [], true)).toBe(true);
		expect(folderHasFiles('argo/', ['/argo/a.nc'])).toBe(true);
	});
});
