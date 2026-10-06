export interface FileTypeInfo {
	value: string;
	label: string;
	hint: string;
}

export const FILE_TYPES: FileTypeInfo[] = [
	{ value: 'PARQUET', label: 'Parquet', hint: 'A path or glob, for example data/**/*.parquet.' },
	{
		value: 'GEOPARQUET',
		label: 'GeoParquet',
		hint: 'Parquet with a geometry column. Beacon reads the geometry as GeoArrow.'
	},
	{ value: 'CSV', label: 'CSV', hint: 'Options can set the delimiter and the header.' },
	{ value: 'ARROW', label: 'Arrow IPC', hint: 'Arrow IPC files (.arrow).' },
	{ value: 'NC', label: 'NetCDF', hint: 'NetCDF files, for example argo/**/*.nc.' },
	{ value: 'HDF5', label: 'HDF5', hint: 'HDF5 files, for example data/**/*.h5. NetCDF-4 is HDF5.' },
	{ value: 'ZARR', label: 'Zarr', hint: 'The path of a Zarr v3 store, with its zarr.json file.' },
	{
		value: 'ATLAS',
		label: 'Atlas',
		hint: 'The path of an Atlas collection, with its data.atlas file.'
	},
	{ value: 'TIFF', label: 'GeoTIFF', hint: 'GeoTIFF or COG files.' },
	{ value: 'BBF', label: 'Beacon Binary Format', hint: 'Beacon Binary Format files (.bbf).' },
	{ value: 'ODV', label: 'ODV', hint: 'Ocean Data View spreadsheet files.' },
	{
		value: 'DELTA',
		label: 'Delta Lake',
		hint: 'The folder of a Delta table, or a URL with a scheme.'
	},
	{
		value: 'ICEBERG',
		label: 'Iceberg',
		hint: 'The folder of an Iceberg table, or a URL with a scheme.'
	},
	{
		value: 'REMOTE',
		label: 'Remote',
		hint: 'A location with a scheme, for example s3://bucket/path.'
	}
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

export function externalTableErrors(form: ExternalTableForm): string[] {
	const errors: string[] = [];

	if (form.name.trim() === '') errors.push('Enter a table name.');
	if (form.location.trim() === '') errors.push('Enter a location.');
	if (form.fileType === '') errors.push('Pick a file type.');

	return errors;
}
