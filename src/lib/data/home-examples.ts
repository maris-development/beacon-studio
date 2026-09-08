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
	/**
	 * The `?query=...` part of a share link for this example, copied from the
	 * workbench's own Share button. To update an example, share the query
	 * again and paste the new value here.
	 */
	shareQuery: string;
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
		shareQuery:
			'?query=H4sIAAAAAAAAA5VUTY%2BbMBD9K5HPwPobyLl7bi9VD1EUuYk3awnbrDFqUJT%2FXgOBZsPKSW%2BW53nezHszPoOPVroOrM%2FgzVkN1kCKpkv%2F2ANIxtCuFk5o6aVrwHpzBntbtdoEoFdaBpColAgR01bVJbkJV9YclW8PUYzwjyAHWfv3SNxLXUsnfOtiWZoQMMp3EYg9dUdp7gDbBLypau5dNTtj%2Fa4PDYpZt7vTaNLl0uf%2BOn4rjFaBOiUwnMQpnBCOvPsn1t0zMrx6qrhRzsvT%2BFt5Iz19dmEobyqOwafJZpciTDdODjSzCPR5nqvVEZZ5GD61QuDAMRv4wNzJsLiXR2nD7biCvqtliP6wVXe0Pf3eWndQRnjZD%2BBmk2KaFYgTTjGipEAsSQnKSoJ5uMGIYAYh2yYBxzIICS9zxkccoRnOGWGkpIjntCwGFM0QZBiiApUcFbTMR1xelAxRSHDA8QFIshLlBS8on4AjMUSYQIz7jHPKxwVut7H9WMz5IsHkx6LW%2F9m6hUTXHVz22n8DtvV1668zpUU4gZA%2B8Ph%2BjoAJROHq1%2Fdvq3T1ehK6ruQKBS5lGi%2FMXv50YSDBu%2Fd1s355%2BS3F3pr%2Bm820cKrJTAUufwFUCgthjAUAAA%3D%3D'
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
		shareQuery:
			'?query=H4sIAAAAAAAAA4WRTUvEMBCG%2F0qYc7utgSr0Jrh4l%2FWiSJi2qQYySU0n0qX0v5uuoKWHFXIY5n0y73zM8Bl1OEM9Qx88QQ06YKU6NPasCCclSbGmIWU5Bg3ZD68GDEiadRihfp2h9TaSS7%2B%2F0JpOsaEVTTEm3UVrl2wDWWTDsbuKePf%2BH8OSrqguUqPDDnjLoDf2t%2B3eB7WbZz8DmbWYLGWVl3f5jTyVZX15L6uI01a83YirlY88RL7s1gfCFEHySYYMy5KBS44pdXy6r8Sj9Q1acfpbtXgwIwfTRDbeiVwcJ6TBaiGTr3Ejo2v1c7CpwAfzMNZF0WhsvcvXAx4IgxkPzhawfAO0rS434wEAAA%3D%3D'
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
		shareQuery:
			'?query=H4sIAAAAAAAAA41Uy27bMBD8FYNnmSG5fPpYtMeivRQ9GIbB2owjQCJViUZjBPn3LuXYVYJU8ckGZ3ZndrjUE%2Fl9DP2JrJ7IfZ9asiLBD6fln7Qn1Rnadr73bcihH8hq%2FUR2qTm2EYm5bgOSfFN7ROKxaZ6rCdykeKjzcT%2FL8fkjyj50%2BWEGz6HtQu%2FzsZ%2FrMiAQ63yaoaTH0yHEN4RNRe7r5jp7PWxjytsCjYmlfvsmo0suz6X3TfTzgLfzpwOPVR%2FTKtLWOCLDX%2F9IVordLHbNbUZpku0oAxcdebvOS%2FgzKtfreTUKsFHjumvvFE738LJv79H%2BreIhJDw9P4p86gKi31NzOqQiv0up39fR51BWYr1eKmokZw44UxUoKphgzEgQm2q9lFRyCVIJpSuQlAvpFIIGMUW1FUZY63Qp02CE05IBQpYaKwW3mkEFQDnT3AmuHUIcmdjAKawSjmrBuHHSWIQEpxK4ZAKYrYAVI1pJxgqGAgx9OMuFLXVWOaUMN7pgBgew2lpp0ImmWgmHLV0ZAKnKWa2sAltJThnYYq0ggP5tAaWppMDReEmBybNJsKhmwGCVpjgJt0JoMc4mhcBzDqZATGujhVG8lFGQTEtuxNjRWlDoSZVEMGRtBDdMWfRoKCgEpAN9xv5zAZvNzD5N7nvcqGmal%2F2dWJ9pNNmvsdMrQy9rOsm4fFPSMXfH%2FPIcWo%2F%2FCLbE3rk8ARKxOR79%2FPZ58TXsa9TpfQw%2BLj75oY6L5eLLo2%2B7JiwANes4ZB934UeP74s85NwNq7u7X8HvUizfcdr6vh5obMjzX67sMUbtBQAA'
	}
];
