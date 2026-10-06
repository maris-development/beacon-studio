import { describe, expect, it } from 'vitest';
import {
	FILE_TYPES,
	externalTableErrors,
	externalTableSpec,
	type ExternalTableForm
} from '../external-table';

const form: ExternalTableForm = {
	name: 'argo',
	location: 'argo/**/*.nc',
	fileType: 'NC',
	partitionCols: '',
	options: [],
	ifNotExists: false
};

describe('externalTableSpec', () => {
	it('leaves out empty partition columns and options', () => {
		expect(externalTableSpec(form)).toEqual({
			name: 'argo',
			location: 'argo/**/*.nc',
			file_type: 'NC',
			if_not_exists: false
		});
	});

	it('adds partition columns and options when given, and drops empty option rows', () => {
		const spec = externalTableSpec({
			...form,
			partitionCols: ' year, month ,',
			options: [
				{ key: 'delimiter', value: ';' },
				{ key: ' ', value: 'x' }
			],
			ifNotExists: true
		});
		expect(spec).toEqual({
			name: 'argo',
			location: 'argo/**/*.nc',
			file_type: 'NC',
			if_not_exists: true,
			partition_cols: ['year', 'month'],
			options: { delimiter: ';' }
		});
	});

	it('trims the name and location', () => {
		expect(externalTableSpec({ ...form, name: ' argo ', location: ' a/*.nc ' })).toMatchObject({
			name: 'argo',
			location: 'a/*.nc'
		});
	});
});

describe('externalTableErrors', () => {
	it('asks for a name, a location and a file type', () => {
		expect(externalTableErrors({ ...form, name: ' ', location: '', fileType: '' })).toEqual([
			'Enter a table name.',
			'Enter a location.',
			'Pick a file type.'
		]);
	});

	it('accepts a complete form', () => {
		expect(externalTableErrors(form)).toEqual([]);
	});
});

describe('FILE_TYPES', () => {
	it('holds the 14 server types', () => {
		expect(FILE_TYPES.map((t) => t.value)).toEqual([
			'PARQUET',
			'GEOPARQUET',
			'CSV',
			'ARROW',
			'NC',
			'HDF5',
			'ZARR',
			'ATLAS',
			'TIFF',
			'BBF',
			'ODV',
			'DELTA',
			'ICEBERG',
			'REMOTE'
		]);
	});
});
