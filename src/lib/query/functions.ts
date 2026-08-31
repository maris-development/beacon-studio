import type { BeaconInstance, CompiledQuery } from "@/beacon-api/types";
import { addToast } from "@/stores/toasts";
import { Utils } from "@/utils";
import { PythonQueryBuilder, PythonQueryExporter, JSONQueryExporter, SQLQueryBuilder, SQLQueryExporter } from "@/beacon-api/query";
import { resolve } from '$app/paths';
import { buildShareLink, SHARE_LINK_PATH } from "@/stores/stored-query";


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

    let queryJson: string;

    try {
        queryJson = JSON.stringify(compiledQuery, null, 2);
    } catch (error) {
        console.error('Error serializing query to JSON:', error);

        addToast({
            message: `Error serializing query to JSON: ${error.message}`,
            type: 'error'
        });
    }

    try {
        if(!queryJson){
            return;
        }

        Utils.copyToClipboard(queryJson);

        addToast({
            message: 'JSON code copied to clipboard',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying JSON code to clipboard:', error);

        addToast({
            message: `Error copying JSON code to clipboard: ${error.message}`,
            type: 'error'
        });

        return;
    }
}
export function downloadJSON(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    let queryJson: string;

    try {
        queryJson = JSON.stringify(compiledQuery, null, 2);
    } catch (error) {
        console.error('Error serializing query to JSON:', error);

        addToast({
            message: `Error serializing query to JSON: ${error.message}`,
            type: 'error'
        });
    }

    try {
        if(!queryJson){
            return;
        }

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

    let sqlQuery: string;

    try {
        sqlQuery = SQLQueryBuilder.toSQL(compiledQuery);

    } catch (error) {
        console.error('Error generating SQL code:', error);
        
        addToast({
            message: `Error generating SQL code: ${error.message}`,
            type: 'error'
        });
        
        return;
    }

    try {
        if(!sqlQuery){
            return;
        }

        Utils.copyToClipboard(sqlQuery);

        addToast({
            message: 'SQL code copied to clipboard',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying SQL code to clipboard:', error);

        addToast({
            message: `Error copying SQL code to clipboard: ${error.message}`,
            type: 'error'
        });

        return;
    }
}
//todo 
export function downloadSQL(compileQuery: () => CompiledQuery): void {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let sqlQuery: string;

    try {
        sqlQuery = SQLQueryBuilder.toSQL(compiledQuery);

    } catch (error) {
        console.error('Error generating SQL code:', error);
        
        addToast({
            message: `Error generating SQL code: ${error.message}`,
            type: 'error'
        });
        
        return;
    }

    try {
        if(!sqlQuery){
            return;
        }

        SQLQueryExporter.downloadAsSql(sqlQuery);

        addToast({
            message: 'SQL code downloaded as beacon-studio-query.sql',
            type: 'success'
        });
    } catch (error) {
        console.error('Error downlaoding SQL code as SQL file:', error);

        addToast({
            message: `Error downloading SQL code as SQL file: ${error.message}`,
            type: 'error'
        });

        return;
    }
}


export function copyUrl(compileQuery: () => CompiledQuery): void {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    let link: string;

    try {
        link = buildShareLink(compiledQuery, resolve(SHARE_LINK_PATH));
    }
    catch (error) {
        console.error('Error building Query URL:', error);

        addToast({
            message: `Error building Query URL: ${error.message}`,
            type: 'error'
        });
    }

    try {
        if(!link){
            return;
        }

        Utils.copyToClipboard(link);

        addToast({
            message: 'Query URL copied to clipboard',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying Query Url to clipboard:', error);

        addToast({
            message: `Error copying Query URL to clipboard: ${error.message}`,
            type: 'error'
        });

        return;
    }
}