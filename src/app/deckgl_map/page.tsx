import { useState, useEffect } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { Deck, PickingInfo } from '@deck.gl/core';

import { ScatterplotLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-layers";
import * as arrow from "apache-arrow";
import { readParquet } from 'parquet-wasm/esm';

import { Table, RecordBatch } from "apache-arrow";
import { Vector } from "apache-arrow/vector";

const GEOARROW_POINT_DATA =
    "http://localhost:5173/beacon-studio/giantargo.arrow";

export function DeckGLMap() {
    const onClick = (info: PickingInfo) => {
        if (info.object) {
            console.log('Clicked on object:', info.object);
            // info.object
            console.log(info.object.toJSON());
        }
    };

    const [table, setTable] = useState<arrow.Table | null>(null);

    useEffect(() => {
        // declare the data fetching function
        const fetchData = async () => {
            const data = await fetch(GEOARROW_POINT_DATA);
            console.log('Size of data:', data.headers.get('Content-Length'));
            const databuffer = await data.arrayBuffer();
            // const parquet_file = await readParquet(new Uint8Array(databuffer));
            // console.log('Parquet file loaded:', parquet_file);
            const arrow_buffer = new Uint8Array(databuffer);
            const table = arrow.tableFromIPC(arrow_buffer);
            console.log('Table Size:', table.numRows);
            console.log(table);

            setTable(table);
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
                // getFillColor: (d) => {
                //     const color = table.getChild("colors")!;
                //     return color ? [color.get(0), color.get(1), color.get(2)] : [0, 0, 0];
                // },

                getFillColor: d => [255, 0, 0],
                getRadius: 5,
                radiusMinPixels: 1, // Helps performance
                pickable: true,
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
            onClick={onClick}
        >
            <Map mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" />
        </DeckGL>
    );
}