importScripts('https://cdn.jsdelivr.net/npm/apache-arrow@21.0.0/Arrow.es2015.min.js');

const { tableFromArrays, vectorFromArray, Type, tableFromIPC, tableToIPC  } = Arrow;

self.onmessage = async (e) => {
    const { action, payload, id } = e.data;

    try {
        switch (action) {
            case 'orderTableByColumn':
                self.postMessage({
                    result: orderTableByColumn(payload.table, payload.column, payload.direction),
                    id: id
                });
                break;

            case 'deduplicateTable':
                self.postMessage({
                    result: deduplicateTable(
                        payload.table,
                        payload.latitudeColumnName,
                        payload.longitudeColumnName,
                        payload.amountOfRows
                    ),
                    id: id
                });
                break;

            case 'getColumnMinMax':
                self.postMessage({
                    result: getColumnMinMax(payload.table, payload.column),
                    id: id
                });
                break;

            default:
                throw new Error(`Unsupported action: ${action}`);
        }
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};

function getColumnMinMax(table, column) {
    table = tableFromIPC(table);
    
    const colIndex = table.schema.fields.map(field => field.name).indexOf(column);

    if (colIndex === -1) throw new Error(`Column "${column}" not found in table schema.`);

    const colVec = table.getChild(column);
    const colArray = colVec.toArray();

    // Check supported types
    switch(colVec.type.typeId) {
        case Type.Timestamp:
        case Type.Int:
        case Type.Float:
            break;
        default:
            console.warn(`Unsupported column type for min/max calculation: ${colVec.type.typeId} (${column})`);
            return {min: NaN, max: NaN};
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const value of colArray) {
        if (value === null || value === undefined) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }

    return {min, max};
}


function orderTableByColumn(table, column, direction) {
    table = tableFromIPC(table);

    const colIndex = table.schema.fields.map(field => field.name).indexOf(column);
    if (colIndex === -1) return table;

    const sortColumn = table.getChild(column);
    const sortedColumnArray = sortColumn.toArray();
    const indexedArray = [];
    for (let i = 0; i < sortedColumnArray.length; i++) {
        indexedArray.push({ index: i, value: sortedColumnArray[i] });
    }

    let sortedIndices;

    switch (sortColumn.type.typeId) {
        case Type.Timestamp:
        case Type.Int:
        case Type.Float:
            sortedIndices = indexedArray.sort((a, b) => {
                const [valA, valB] = [a.value, b.value];
                if (valA === null && valB === null) return 0;
                if (valA === null) return 1;
                if (valB === null) return -1;
                return direction === 'asc' ? valA - valB : valB - valA;
            }).map(item => item.index);
            break;

        case Type.Utf8:
            sortedIndices = indexedArray.sort((a, b) => {
                const [valA, valB] = [a.value, b.value];
                if (valA === null && valB === null) return 0;
                if (valA === null) return 1;
                if (valB === null) return -1;
                return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }).map(item => item.index);
            break;

        case Type.Bool:
            sortedIndices = indexedArray.sort((a, b) => {
                const [valA, valB] = [a.value, b.value];
                if (valA === null && valB === null) return 0;
                if (valA === null) return 1;
                if (valB === null) return -1;
                return direction === 'asc' ? (valA === valB ? 0 : valA ? 1 : -1) : (valA === valB ? 0 : valA ? -1 : 1);
            }).map(item => item.index);
            break;

        default:
            return table;
    }

    const sortedColumns = {};
    for (const field of table.schema.fields) {
        const name = field.name;
        const col = table.getChild(name);
        const values = sortedIndices.map(idx => col.get(idx));
        sortedColumns[name] = vectorFromArray(values, field.type);
    }

    const sortedTable = tableFromArrays(sortedColumns);
    sortedTable.schema = table.schema;

    return tableToIPC(sortedTable);
}

function deduplicateTable(table, latitudeColumnName = 'Latitude', longitudeColumnName = 'Longitude', amountOfRows = 0) {
    table = tableFromIPC(table);
    

    if (!amountOfRows) amountOfRows = table.numRows;

    const latCol = table.getChild(latitudeColumnName);
    const lonCol = table.getChild(longitudeColumnName);
    const seen = new Set();
    const keepIndexes = [];

    for (let i = 0; i < amountOfRows; i++) {
        const lat = latCol.get(i);
        const lon = lonCol.get(i);
        const key = `${lat?.toFixed(2)},${lon?.toFixed(2)}`;
        if (!seen.has(key)) {
            seen.add(key);
            keepIndexes.push(i);
        }
    }

    const dedupColumns = {};
    for (const field of table.schema.fields) {
        const name = field.name;
        const col = table.getChild(name);
        const values = keepIndexes.map(idx => col.get(idx));
        dedupColumns[name] = vectorFromArray(values, field.type);
    }

    const deduped = tableFromArrays(dedupColumns);

    deduped.schema = table.schema;

    return tableToIPC(deduped);

}
