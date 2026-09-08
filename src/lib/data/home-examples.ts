import type { CompiledQuery } from '@/beacon-api/types';

/**
 * One card of the Quick start examples section on the home page.
 *
 * `rows` and `seconds` come from a reference run of the query. The card states
 * them, so a new user knows the size of the result before the run starts.
 */
export type HomeExample = {
	/** Card heading. */
	title: string;
	/** One sentence about the selection. */
	description: string;
	/** The node that holds the data, in words. */
	sourceName: string;
	/** The table on that node. */
	tableName: string;
	/** File name of the screenshot, under `static/images/`. */
	image: string;
	/** Row count of the reference run. */
	rows: number;
	/** Duration of the reference run, in seconds. */
	seconds: number;
	/** Output format of the query, in words. */
	format: string;
	/** The name that the workbench shows for the query. */
	queryName: string;
	/** The node that runs the query. */
	instanceUrl: string;
	/** The runnable query. */
	query: CompiledQuery;
};

/** The examples, in the order that the home page shows them. */
export const HOME_EXAMPLES: HomeExample[] = [
	{
		title: 'Trans-equatorial Atlantic transect',
		description:
			'Temperature, salinity and oxygen in a 500 km wide cross section at 24°W, from 32°S to 34°N.',
		sourceName: 'World Ocean Database',
		tableName: 'easy-wod',
		image: 'HomeQueryExample1-small.jpg',
		rows: 2_235_503,
		seconds: 5.6,
		format: 'Parquet',
		queryName: 'WOD - Example 1',
		instanceUrl: 'https://beacon-wod.maris.nl',
		query: {
			from: 'easy-wod',
			query_parameters: [
				{
					column: 'time',
					alias: null
				},
				{
					column: 'longitude',
					alias: null
				},
				{
					column: 'latitude',
					alias: null
				},
				{
					column: 'depth',
					alias: null
				},
				{
					column: 'temperature',
					alias: null
				},
				{
					column: 'salinity',
					alias: null
				},
				{
					column: 'oxygen',
					alias: null
				}
			],
			filters: [
				{
					is_not_null: {
						for_query_parameter: 'time'
					}
				},
				{
					for_query_parameter: 'longitude',
					min: -30,
					max: -12
				},
				{
					for_query_parameter: 'latitude',
					min: -30,
					max: 32
				},
				{
					is_not_null: {
						for_query_parameter: 'depth'
					}
				},
				{
					is_not_null: {
						for_query_parameter: 'temperature'
					}
				},
				{
					for_query_parameter: 'temperature',
					min: 0,
					max: 50
				},
				{
					is_not_null: {
						for_query_parameter: 'salinity'
					}
				},
				{
					for_query_parameter: 'salinity',
					min: 30,
					max: 40
				},
				{
					is_not_null: {
						for_query_parameter: 'oxygen'
					}
				},
				{
					for_query_parameter: 'oxygen',
					min: 0,
					max: 300
				},
				{
					longitude_query_parameter: 'longitude',
					latitude_query_parameter: 'latitude',
					geometry: {
						type: 'Polygon',
						coordinates: [
							[
								[-24.8163642143815, -31.932664221325005],
								[-25.0036975643815, 34.27535394167498],
								[-24.105201819618497, 34.277895140324986],
								[-23.917868469618497, -31.930123022674998],
								[-24.8163642143815, -31.932664221325005]
							]
						]
					}
				},
				{
					for_query_parameter: 'latitude',
					min: -31.932664221325005,
					max: 34.277895140324986
				},
				{
					for_query_parameter: 'longitude',
					min: -25.0036975643815,
					max: -23.917868469618497
				}
			],
			output: {
				format: 'parquet'
			}
		}
	},
	{
		title: 'Global temperature, summer 2025',
		description:
			'Daily maximum air temperature at 2 m across the whole grid, from 12 to 16 July 2025.',
		sourceName: 'ERA5 reanalysis',
		tableName: 'era5_daily_max_2m_temperature',
		image: 'HomeQueryExample2-small.jpg',
		rows: 5_191_200,
		seconds: 3.2,
		format: 'Parquet',
		queryName: 'ERA5 Global Temperature Distribution - Example 2',
		instanceUrl: 'https://beacon-era5.maris.nl/',
		query: {
			from: 'era5_daily_max_2m_temperature',
			query_parameters: [
				{
					column: 'valid_time',
					alias: null
				},
				{
					column: 'latitude',
					alias: null
				},
				{
					column: 'longitude',
					alias: null
				},
				{
					column: 't2m',
					alias: null
				},
				{
					column: 'number',
					alias: null
				}
			],
			filters: [
				{
					for_query_parameter: 'valid_time',
					min: '2025-07-12T00:00:00Z',
					max: '2025-07-16T00:00:00Z'
				}
			],
			output: {
				format: 'parquet'
			}
		}
	},
	{
		title: 'Mediterranean Basin',
		description:
			'Temperature, salinity and oxygen inside a 14 point polygon that covers the whole basin.',
		sourceName: 'World Ocean Database',
		tableName: 'easy-wod',
		image: 'HomeQueryExample3-small.jpg',
		rows: 7_142_857,
		seconds: 12.0,
		format: 'Parquet',
		queryName: 'WOD Mediterranean Basin - Example 3',
		instanceUrl: 'https://beacon-wod.maris.nl',
		query: {
			from: 'easy-wod',
			query_parameters: [
				{
					column: 'time',
					alias: null
				},
				{
					column: 'longitude',
					alias: null
				},
				{
					column: 'latitude',
					alias: null
				},
				{
					column: 'depth',
					alias: null
				},
				{
					column: 'temperature',
					alias: null
				},
				{
					column: 'salinity',
					alias: null
				},
				{
					column: 'oxygen',
					alias: null
				}
			],
			filters: [
				{
					is_not_null: {
						for_query_parameter: 'time'
					}
				},
				{
					is_not_null: {
						for_query_parameter: 'depth'
					}
				},
				{
					is_not_null: {
						for_query_parameter: 'temperature'
					}
				},
				{
					for_query_parameter: 'temperature',
					min: 0,
					max: 50
				},
				{
					is_not_null: {
						for_query_parameter: 'salinity'
					}
				},
				{
					for_query_parameter: 'salinity',
					min: 30,
					max: 40
				},
				{
					is_not_null: {
						for_query_parameter: 'oxygen'
					}
				},
				{
					for_query_parameter: 'oxygen',
					min: 0,
					max: 300
				},
				{
					longitude_query_parameter: 'longitude',
					latitude_query_parameter: 'latitude',
					geometry: {
						type: 'Polygon',
						coordinates: [
							[
								[-5.741093105, 35.202007432],
								[-4.414345256, 34.124950747],
								[5.682728896, 35.637296403],
								[8.784218603, 33.106192169],
								[15.60749596, 29.620179478],
								[21.431402308, 30.202654008],
								[35.043498128, 29.859557176],
								[37.748688476, 36.652994792],
								[29.598658538, 41.0387842],
								[23.688598647, 42.121410904],
								[15.383497378, 46.186182262],
								[8.422378137, 46.066762751],
								[1.340641727, 42.883584753],
								[-5.672170586, 37.354754936],
								[-5.741093105, 35.202007432]
							]
						]
					}
				},
				{
					for_query_parameter: 'latitude',
					min: 29.620179478,
					max: 46.186182262
				},
				{
					for_query_parameter: 'longitude',
					min: -5.741093105,
					max: 37.748688476
				}
			],
			output: {
				format: 'parquet'
			}
		}
	}
];
