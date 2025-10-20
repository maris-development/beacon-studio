export type Column = { name: string; data_type: string; nullable?: boolean };
export type Table = { table_name: string; columns: Column[] };

export type FuncParam = { name: string; data_type: string; optional?: boolean, description?: string };

export type ScalarFunction = {
    kind: "scalar";
    function_name: string;
    description?: string;
    return_type: string;
    params?: FuncParam[];
};

export type TableFunction = {
    kind: "table";
    name: string;
    params?: FuncParam[];
    columns: Column[]; // explicit TVF output columns
};

export type Schema = {
    tables: Record<string, Column[]>;
    scalarFunctions: ScalarFunction[];
    tableFunctions: TableFunction[];
};

export type Fetchers = {
    fetchTables: () => Promise<Table[]>;
    fetchScalarFunctions: () => Promise<ScalarFunction[]>;
    fetchTableFunctions: () => Promise<TableFunction[]>;
};

export async function loadSchema(fetchers: Fetchers): Promise<Schema> {
    const [tables, scalarFunctions, tableFunctions] = await Promise.all([
        fetchers.fetchTables(),
        fetchers.fetchScalarFunctions(),
        fetchers.fetchTableFunctions(),
    ]);

    const schema: Schema = {
        tables: {},
        scalarFunctions: scalarFunctions ?? ([] as ScalarFunction[]),
        tableFunctions: tableFunctions ?? ([] as TableFunction[]),
    };
    for (const t of tables) schema.tables[t.table_name] = t.columns || [];
    return schema;
}

export type SchemaStore = ReturnType<typeof makeSchemaStore>;

export function makeSchemaStore(initial: Schema) {
    let current = initial;
    return {
        get: () => current,
        set: (next: Schema) => (current = next),
        patchTables: (tables: Table[]) => {
            const s = { ...current, tables: { ...current.tables } };
            for (const t of tables) s.tables[t.table_name] = t.columns;
            current = s;
        },
        patchScalarFunctions(fns: ScalarFunction[]) {
            current = { ...current, scalarFunctions: fns };
        },
        patchTableFunctions(fns: TableFunction[]) {
            current = { ...current, tableFunctions: fns };
        },
    };
}
