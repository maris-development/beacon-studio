import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const BEACON_INSTANCE = "https://beacon-argo.maris.nl";
export const BEACON_TOKEN = "";
export const BEACON_TEST_GEO_QUERY = {
  "query_parameters": [
    { "column": "JULD", "alias": "time" },
    { "column": "TEMP", "alias": "temperature" },
    { "column": "TEMP.standard_name", "alias": "temperature_standard_name" },
    { "column": "TEMP.units", "alias": "temperature_units" },
    { "column": "PSAL", "alias": "salinity" },
    { "column": "PSAL.standard_name", "alias": "salinity_standard_name" },
    { "column": "PSAL.units", "alias": "salinity_units" },
    { "function": "pressure_to_depth_teos_10", "args": ["PRES", "LATITUDE"], "alias": "depth_harmonized" },
    { "column": "PRES", "alias": "pressure" }, { "column": "LONGITUDE", "alias": "longitude" },
    { "column": "LATITUDE", "alias": "latitude" },
    { "column": "PLATFORM_NUMBER", "alias": "platform_number" },
    { "column": "CYCLE_NUMBER", "alias": "cycle_number" }],
  "filters": [
    { "for_query_parameter": "depth_harmonized", "max": 10, "min": 0 },
    { "for_query_parameter": "time", "min": "2020-01-01T00:00:00Z", "max": "2020-12-31T00:00:00Z" }
  ],
  "output": {
    "format": {
      "geoparquet": {
        "longitude_column": "longitude",
        "latitude_column": "latitude"
      }
    }
  }
};



export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

