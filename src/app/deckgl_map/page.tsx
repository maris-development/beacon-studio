import { useState, useEffect } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { Deck, PickingInfo } from '@deck.gl/core';


import 'maplibre-gl/dist/maplibre-gl.css';
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";
import { EditableGeoJsonLayer, DrawRectangleMode } from "@deck.gl-community/editable-layers";

import * as arrow from "apache-arrow";
import { readParquet, ReaderOptions } from 'parquet-wasm/esm';

import { Table, RecordBatch, vectorFromArray, tableFromArrays } from "apache-arrow";
import { Vector } from "apache-arrow/vector";
import { scaleSequential, scaleOrdinal } from "d3-scale";
import { interpolateViridis, interpolateBrBG } from "d3-scale-chromatic";
import * as d3 from "d3";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const GEOARROW_POINT_DATA =
    "http://localhost:5173/beacon-studio/rws4.parquet";

// For numerical values
const colorScale = scaleSequential(interpolateBrBG).domain([40, -5]);

const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 1,
    pointerEvents: 'none'
};

export function DeckGLMap() {
    const [onClickInfo, setOnClickInfo] = useState<PickingInfo | null>(null);
    const [onClickClose, setOnClickClose] = useState<boolean>(false);
    const [table, setTable] = useState<arrow.Table | null>(null);

    useEffect(() => {
        // declare the data fetching function
        const fetchData = async () => {
            const data = await fetch(GEOARROW_POINT_DATA);
            const databuffer = await data.arrayBuffer();
            const parquet_file = await readParquet(new Uint8Array(databuffer), {
                batchSize: 128 * 1024
            });

            const arrow_stream = parquet_file.intoIPCStream()
            const table = arrow.tableFromIPC(arrow_stream);

            const latCol = table.getChild('Latitude');
            const lonCol = table.getChild('Longitude');

            const seen = new Set();
            const keepIndexes: number[] = [];

            console.log(table)
            console.log(`Deduplicating ${table.numRows} rows based on Latitude and Longitude`);

            // Efficiently iterate column-wise
            for (let i = 0; i < table.numRows; i++) {
                const lat: number = latCol?.get(i);
                const lon: number = lonCol?.get(i);

                // Optional: round coordinates to avoid floating-point noise
                const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

                if (!seen.has(key)) {
                    seen.add(key);
                    keepIndexes.push(i);
                }
            }

            console.log(`Deduplicated from ${table.numRows} to ${keepIndexes.length} rows`);
            const dedupColumns = [];
            for (const field of table.schema.fields) {
                const col = table.getChild(field.name);
                console.log(col)
                const values = keepIndexes.map(i => col.get(i));
                // console.log(values)
                dedupColumns.push(vectorFromArray(values, field.type));
            }

            const dedupTable = tableFromArrays(dedupColumns);

            console.log(dedupTable);

            setTable(dedupTable);
        };

        if (!table) {
            fetchData().catch(console.error);
        }
    });

    const layers = [];

    table &&
        layers.push(
            new GeoArrowScatterplotLayer({
                id: "geoarrow-points",
                data: table,
                // Pre-computed colors in the original table
                opacity: 1,
                radiusUnits: 'meters',

                getFillColor: (d) => {
                    const row = d.data.data.get(d.index);
                    if (!row) {
                        return [0, 0, 0, 0]; // Default to transparent black if row is undefined
                    }

                    const value = row['Waarde'];
                    // Check if value if a number
                    if (typeof value !== 'number' || isNaN(value)) {
                        return [0, 0, 0, 0]; // Default to transparent black if value is not a number
                    }
                    const color = d3.color(colorScale(value))?.rgb(); // returns RGB object
                    // console.log('Color for value', value, ':', color);
                    if (!color) {
                        return [0, 0, 0, 0]; // Default to black if color is not defined
                    }
                    return [color.r, color.g, color.b, 255];
                },
                getRadius: 50000,
                radiusMaxPixels: 10,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 0, 128], // Yellow highlight color
                onClick: (info) => {
                    if (!info.object) {
                        setOnClickInfo(null);
                        setOnClickClose(false);
                        return;
                    }
                    setOnClickClose(true);
                    setOnClickInfo(info);
                }
            }),
        );

    return (
        <DeckGL
            initialViewState={{
                longitude: 0.45,
                latitude: 51.47,
                zoom: 2
            }}
            controller
            layers={layers}
        >
            <Map mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" />
            {onClickInfo && onClickInfo.object && (
                <div style={{ ...tooltipStyle, left: onClickInfo.x, top: onClickInfo.y }}>
                    <Popover
                        open={onClickClose}
                        onOpenChange={(val) => {
                            setOnClickClose(val);
                        }}
                    >
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full invisible">
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" side="top" align="center">
                            <Card className="border-0 shadow-none gap-3">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <CardTitle className="text-lg">Observation #{onClickInfo.index}</CardTitle>
                                            <CardDescription className="mt-1">
                                                Showing details for the selected observation.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="">
                                    {/* Coordinates Section */}
                                    <div className="bg-gray-100 p-3 rounded-lg">
                                        <h4 className="font-medium text-sm mb-2">Coordinates</h4>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">Latitude:</span>
                                                <div className="font-mono">{Math.round(onClickInfo.coordinate[0] * 100) / 100}</div>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Longitude:</span>
                                                <div className="font-mono">{Math.round(onClickInfo.coordinate[1] * 100) / 100}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Additional Data Section */}
                                    <div>
                                        <h4 className="font-medium text-sm mb-2 pt-3">Details</h4>
                                        <div className="space-y-2">
                                            {Object.entries(onClickInfo.object).filter(([key]) => key !== 'geometry').map(([key, value]) => (
                                                <div key={key} className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">{key}:</span>
                                                    <span className="font-medium text-right">{value}</span>
                                                </div>

                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-4">
                                        <Button size="sm" className="flex-1">
                                            View Profile
                                        </Button>
                                        <Button size="sm" variant="outline" className="flex-1">
                                            Download Data
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </PopoverContent>
                    </Popover>
                </div>
            )}
        </DeckGL>
    );
}