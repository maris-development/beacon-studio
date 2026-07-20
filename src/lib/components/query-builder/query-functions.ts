import type { CompiledQuery } from "@/beacon-api/types";
import { addToast } from "@/stores/toasts";
import { Utils } from "@/utils";
import { PythonQueryBuilder } from "@/beacon-api/query";


function tryCompileQuery(compileQuery: () => CompiledQuery): CompiledQuery | null {
    try {
        return compileQuery();
    } catch (error) {
        console.error(error);

        addToast({
            message: `Error compiling query: ${(error as Error).message}`,
            type: "error"
        });

        return null;
    }
}

export function copyJSON(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let queryJson = JSON.stringify(compiledQuery, null, 2);

    Utils.copyToClipboard(queryJson);

    addToast({
        message: 'Query JSON copied to clipboard',
        type: 'success'
    });
}
export function downloadJSON(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for downloading query as JSON for compiled query:", compiledQuery);
}

export function copyPython(compileQuery: () => CompiledQuery): void {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let pythonCode: string;

    try {
        pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery);

    } catch (error) {
        console.error('Error generating Python code:', error);
        
        addToast({
            message: `Error generating Python code: ${error.message}`,
            type: 'error'
        });
        
        return;
    }

    try {
        if(!pythonCode){
            return;
        }

        Utils.copyToClipboard(pythonCode);

        addToast({
            message: 'Python code copied to clipboard',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying Python code to clipboard:', error);

        addToast({
            message: `Error copying Python code to clipboard: ${error.message}`,
            type: 'error'
        });

        return;
    }
}
export function downloadPython(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for downloading query as Python code for compiled query:", compiledQuery);
}


export function copySQL(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for copying query as SQL for compiled query:", compiledQuery);
}
export function downloadSQL(compileQuery: () => CompiledQuery): void {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for downloading query as SQL for compiled query:", compiledQuery);
}


export function copyUrl(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for share query as URL for compiled query:", compiledQuery);
}