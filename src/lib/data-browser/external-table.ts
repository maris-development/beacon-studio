import { message, type Message } from '@/i18n';

export interface FileTypeInfo {
	value: string;
	/** The product name of the format. It is not translated. */
	label: string;
	hint: Message;
}

export const FILE_TYPES: FileTypeInfo[] = [
	{ value: 'PARQUET', label: 'Parquet', hint: message('dataBrowser.tables.external.hint.parquet') },
	{
		value: 'GEOPARQUET',
		label: 'GeoParquet',
		hint: message('dataBrowser.tables.external.hint.geoparquet')
	},
	{ value: 'CSV', label: 'CSV', hint: message('dataBrowser.tables.external.hint.csv') },
	{ value: 'ARROW', label: 'Arrow IPC', hint: message('dataBrowser.tables.external.hint.arrow') },
	{ value: 'NC', label: 'NetCDF', hint: message('dataBrowser.tables.external.hint.nc') },
	{ value: 'HDF5', label: 'HDF5', hint: message('dataBrowser.tables.external.hint.hdf5') },
	{ value: 'ZARR', label: 'Zarr', hint: message('dataBrowser.tables.external.hint.zarr') },
	{ value: 'ATLAS', label: 'Atlas', hint: message('dataBrowser.tables.external.hint.atlas') },
	{ value: 'TIFF', label: 'GeoTIFF', hint: message('dataBrowser.tables.external.hint.tiff') },
	{
		value: 'BBF',
		label: 'Beacon Binary Format',
		hint: message('dataBrowser.tables.external.hint.bbf')
	},
	{ value: 'ODV', label: 'ODV', hint: message('dataBrowser.tables.external.hint.odv') },
	{ value: 'DELTA', label: 'Delta Lake', hint: message('dataBrowser.tables.external.hint.delta') },
	{ value: 'ICEBERG', label: 'Iceberg', hint: message('dataBrowser.tables.external.hint.iceberg') },
	{ value: 'REMOTE', label: 'Remote', hint: message('dataBrowser.tables.external.hint.remote') }
];

export interface ExternalTableForm {
	name: string;
	location: string;
	fileType: string;
	/** Comma separated. */
	partitionCols: string;
	options: { key: string; value: string }[];
	ifNotExists: boolean;
}

/** The body of `POST /api/admin/external-tables`. Empty lists stay out. */
export function externalTableSpec(form: ExternalTableForm): Record<string, unknown> {
	const spec: Record<string, unknown> = {
		name: form.name.trim(),
		location: form.location.trim(),
		file_type: form.fileType,
		if_not_exists: form.ifNotExists
	};

	const partitionCols = form.partitionCols
		.split(',')
		.map((column) => column.trim())
		.filter((column) => column !== '');
	if (partitionCols.length > 0) spec.partition_cols = partitionCols;

	const options: Record<string, string> = {};
	for (const option of form.options) {
		if (option.key.trim() !== '') options[option.key.trim()] = option.value;
	}
	if (Object.keys(options).length > 0) spec.options = options;

	return spec;
}

export function externalTableErrors(form: ExternalTableForm): Message[] {
	const errors: Message[] = [];

	if (form.name.trim() === '') errors.push(message('dataBrowser.tables.external.nameMissing'));
	if (form.location.trim() === '') {
		errors.push(message('dataBrowser.tables.external.locationMissing'));
	}
	if (form.fileType === '') errors.push(message('dataBrowser.tables.external.typeMissing'));

	return errors;
}
