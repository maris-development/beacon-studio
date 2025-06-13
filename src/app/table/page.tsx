'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ChevronUp, ChevronDown } from 'lucide-react';

// Update this version to match the version you're using.
import * as arrow from 'apache-arrow';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import wasmInit, { Table as WasmTable, Compression, readParquet, writeParquet, WriterPropertiesBuilder } from "parquet-wasm";

// Update this version to match the version you're using.
await wasmInit("/beacon-studio/parquet_wasm_bg.wasm");

const ROWS_PER_PAGE = 10;

function structRowsToColumnar(rows: any[], columns: string[]) {
    const columnData: Record<string, any[]> = {};

    // Initialize empty arrays for each column
    for (const col of columns) {
        columnData[col] = new Array(rows.length);
    }

    for (let i = 0; i < rows.length; i++) {
        for (const col of columns) {
            columnData[col][i] = rows[i][col];
        }
    }

    return columnData; // usable for tableFromArrays() or writeParquet()
}

export default function ParquetTable() {
    const [data, setData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const handleDownload = () => {
        try {
            const writerProperties = new WriterPropertiesBuilder()
                .setCompression(Compression.SNAPPY)
                .build()


            console.log(data);
            console.log(columns);
            const columnarData = structRowsToColumnar(data, columns);
            console.log(columnarData);
            const table = tableFromArrays(columnarData);
            console.log(table)
            const wasm_table = WasmTable.fromIPCStream(tableToIPC(table, "stream"))
            const parquetBuffer = writeParquet(wasm_table, writerProperties); // returns Uint8Array
            const blob = new Blob([parquetBuffer], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'data.parquet';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to write Parquet:', err);
            setError('Could not download data as Parquet.');
        }
    };


    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const parquet_file = await readParquet(new Uint8Array(buffer));
            const table = arrow.tableFromIPC(parquet_file.intoIPCStream());
            console.log(table.schema.toString());
            console.log('Rows:', table.toArray());


            if (table.numRows > 0) {
                setColumns(Object.keys(table.toArray()[0]));
                setData(table.toArray());
                setCurrentPage(1);
                setSortConfig(null);
                setError(null);
            } else {
                setError('No rows found.');
                setData([]);
            }
        } catch (err) {
            console.error('Error reading Parquet:', err);
            setError('Failed to read Parquet file.');
        }
    };

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;
        return [...data].sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, sortConfig]);

    const paginated = sortedData.slice(
        (currentPage - 1) * ROWS_PER_PAGE,
        currentPage * ROWS_PER_PAGE
    );

    const totalPages = Math.ceil(sortedData.length / ROWS_PER_PAGE);

    const handleSort = (column: string) => {
        setSortConfig((prev) => {
            if (!prev || prev.key !== column) return { key: column, direction: 'asc' };
            return { key: column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        });
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Input type="file" accept=".parquet" onChange={handleFileUpload} />
                <Button disabled>Load File</Button>
            </div>

            {error && <p className="text-destructive">{error}</p>}

            {data.length > 0 && (
                <>
                    <div className="overflow-auto border rounded-lg max-h-[600px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {columns.map((col) => (
                                        <TableHead
                                            key={col}
                                            onClick={() => handleSort(col)}
                                            className="cursor-pointer select-none"
                                        >
                                            <div className="flex items-center gap-1">
                                                {col}
                                                {sortConfig?.key === col &&
                                                    (sortConfig.direction === 'asc' ? (
                                                        <ChevronUp size={16} />
                                                    ) : (
                                                        <ChevronDown size={16} />
                                                    ))}
                                            </div>
                                        </TableHead>
                                    ))}

                                    {/* Download button in header row */}
                                    <TableHead className="text-right">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleDownload}
                                            className="ml-auto"
                                        >
                                            Download
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {paginated.map((row, i) => (
                                    <TableRow key={i}>
                                        {columns.map((col) => (
                                            <TableCell key={col}>{String(row[col] ?? '')}</TableCell>
                                        ))}
                                        <TableCell /> {/* Empty cell to align with download button header */}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex justify-between items-center pt-4">
                        <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </span>
                        <div className="space-x-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {data.length === 0 && !error && (
                <p className="text-muted-foreground">Upload a .parquet file to display data.</p>
            )}
        </div>
    );
}