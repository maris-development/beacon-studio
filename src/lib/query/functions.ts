import type { BeaconInstance, CompiledQuery } from "@/beacon-api/types";
import { addToast } from "@/stores/toasts";
import { Utils } from "@/utils";
import { PythonQueryBuilder, PythonQueryExporter, JSONQueryExporter } from "@/beacon-api/query";


function tryCompileQuery(compileQuery: () => CompiledQuery): CompiledQuery | null {
    let result: CompiledQuery | null = null;
    let error: Error | null = null;

    try {
        result = compileQuery();
    } catch (_error) {
        console.error(_error);
        error = _error as Error;
    }

    if(!result){
        let message = 'Error compiling query: compileQuery function returned null.';

        if(error?.message){
            message += `Error compiling query: ${error.message}`;
        }

        addToast({
            message: message,
            type: "error"
        });
    }

    return result;
}

export function copyJSON(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    const queryJson = JSON.stringify(compiledQuery, null, 2);

    

    addToast({
        message: 'Query JSON copied to clipboard',
        type: 'success'
    });
}
export function downloadJSON(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    const queryJson = JSON.stringify(compiledQuery, null, 2);

    try {
        JSONQueryExporter.downloadAsJson(queryJson);

        addToast({
            message: 'Query JSON downloaded as beacon-studio-query.json',
            type: 'success'
        });
    }
    catch (error) {
        console.error('Error downloading JSON:', error);

        addToast({
            message: `Error downloading JSON: ${error.message}`,
            type: 'error'
        });
    }
}

export function copyPython(
    compileQuery: () => CompiledQuery,
    instance: BeaconInstance | null
): void {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let pythonCode: string;

    try {
        pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery, instance);

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
export function downloadPython(
    compileQuery: () => CompiledQuery,
    instance: BeaconInstance | null
): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let pythonCode: string;

    try {
        pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery, instance);

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

        PythonQueryExporter.downloadAsNotebook(pythonCode);

        addToast({
            message: 'Python code downloaded as beacon-studio-query.ipynb',
            type: 'success'
        });
    } catch (error) {
        console.error('Error downlaoding Python code as notebook:', error);

        addToast({
            message: `Error downloading Python code as notebook: ${error.message}`,
            type: 'error'
        });

        return;
    }
}


export function copySQL(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    notImplementedYetToast('Copy SQL');
}
export function downloadSQL(compileQuery: () => CompiledQuery): void {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    console.log("Placeholder function for downloading query as SQL for compiled query:", compiledQuery);

    notImplementedYetToast('Download SQL');
}


export function copyUrl(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    console.log("Placeholder function for share query as URL for compiled query:", compiledQuery);

    notImplementedYetToast('Copy URL');
}

function notImplementedYetToast(feature: string = ''): void {
    const message = feature ? `The feature "${feature}" is not implemented yet.` : 'This feature is not implemented yet.';

    addToast({
        message,
        type: 'info'
    });
}