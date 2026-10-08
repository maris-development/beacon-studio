import type { BeaconNode, CompiledQuery } from "@/beacon-api/types";
import { addToast } from "@/stores/toasts";
import { Utils } from "@/utils";
import { PythonQueryBuilder, PythonQueryExporter, JSONQueryExporter, SQLQueryBuilder, SQLQueryExporter } from "@/beacon-api/query";
import { buildShareLink, type ShareableQuery } from "@/stores/stored-query";


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
        if(error?.message){
            addToast({
                key: 'query.export.shareEmptyCompileFailed',
                message: error.message,
                type: "error"
            });
        } else {
            addToast({
                key: 'query.export.shareEmpty',
                type: "error"
            });
        }
    }

    return result;
}

export async function copyJSON(compileQuery: () => CompiledQuery): Promise<void> {

    const compiledQuery = tryCompileQuery(compileQuery);

    if (!compiledQuery) return;

    let queryJson: string;

    try {
        queryJson = JSON.stringify(compiledQuery, null, 2);
    } catch (error) {
        console.error('Error serializing query to JSON:', error);

        addToast({
            key: 'query.export.jsonSerializeFailed',
            message: error.message,
            type: 'error'
        });
    }

    try {
        if(!queryJson){
            return;
        }

        const copied = await Utils.copyToClipboard(queryJson);

        if (!copied) {
            addToast({
                key: 'query.export.jsonCopyFailed',
                type: 'error'
            });

            return;
        }

        addToast({
            key: 'query.export.jsonCopied',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying JSON code to clipboard:', error);

        addToast({
            key: 'query.export.jsonCopyError',
            message: error.message,
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
            key: 'query.export.jsonSerializeFailed',
            message: error.message,
            type: 'error'
        });
    }

    try {
        if(!queryJson){
            return;
        }

        JSONQueryExporter.downloadAsJson(queryJson);

        addToast({
            key: 'query.export.jsonDownloaded',
            type: 'success'
        });
    }
    catch (error) {
        console.error('Error downloading JSON:', error);

        addToast({
            key: 'query.export.jsonDownloadFailed',
            message: error.message,
            type: 'error'
        });
    }
}

export async function copyPython(
    compileQuery: () => CompiledQuery,
    node: BeaconNode | null
): Promise<void> {
    
    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let pythonCode: string;

    try {
        pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery, node);

    } catch (error) {
        console.error('Error generating Python code:', error);
        
        addToast({
            key: 'query.export.pythonFailed',
            message: error.message,
            type: 'error'
        });
        
        return;
    }

    try {
        if(!pythonCode){
            return;
        }

        const copied = await Utils.copyToClipboard(pythonCode);

        if (!copied) {
            addToast({
                key: 'query.export.pythonCopyFailed',
                type: 'error'
            });

            return;
        }

        addToast({
            key: 'query.export.pythonCopied',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying Python code to clipboard:', error);

        addToast({
            key: 'query.export.pythonCopyError',
            message: error.message,
            type: 'error'
        });

        return;
    }
}
export function downloadPython(
    compileQuery: () => CompiledQuery,
    node: BeaconNode | null
): void {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let pythonCode: string;

    try {
        pythonCode = PythonQueryBuilder.toPythonCode(compiledQuery, node);

    } catch (error) {
        console.error('Error generating Python code:', error);
        
        addToast({
            key: 'query.export.pythonFailed',
            message: error.message,
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
            key: 'query.export.pythonDownloaded',
            type: 'success'
        });
    } catch (error) {
        console.error('Error downlaoding Python code as notebook:', error);

        addToast({
            key: 'query.export.pythonDownloadFailed',
            message: error.message,
            type: 'error'
        });

        return;
    }
}


export async function copySQL(compileQuery: () => CompiledQuery): Promise<void> {

    const compiledQuery = tryCompileQuery(compileQuery);
    if (!compiledQuery) return;

    let sqlQuery: string;

    try {
        sqlQuery = SQLQueryBuilder.toSQL(compiledQuery);

    } catch (error) {
        console.error('Error generating SQL code:', error);
        
        addToast({
            key: 'query.export.sqlFailed',
            message: error.message,
            type: 'error'
        });
        
        return;
    }

    try {
        if(!sqlQuery){
            return;
        }

        const copied = await Utils.copyToClipboard(sqlQuery);

        if (!copied) {
            addToast({
                key: 'query.export.sqlCopyFailed',
                type: 'error'
            });

            return;
        }

        addToast({
            key: 'query.export.sqlCopied',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying SQL code to clipboard:', error);

        addToast({
            key: 'query.export.sqlCopyError',
            message: error.message,
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
            key: 'query.export.sqlFailed',
            message: error.message,
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
            key: 'query.export.sqlDownloaded',
            type: 'success'
        });
    } catch (error) {
        console.error('Error downlaoding SQL code as SQL file:', error);

        addToast({
            key: 'query.export.sqlDownloadFailed',
            message: error.message,
            type: 'error'
        });

        return;
    }
}


/**
 * Copy a share link for a record to the clipboard. See `buildShareLink`.
 *
 * The node of the record is a ref, not the resolved node. A ref keeps the URL
 * of a node that this app does not have, so the link still names it.
 */
export async function copyUrl(record: ShareableQuery | null): Promise<void> {

    if (!record?.compiled) {
        addToast({
            key: 'query.export.shareEmpty',
            type: 'error'
        });
        return;
    }

    let link: string;

    try {
        link = buildShareLink(record);
    }
    catch (error) {
        console.error('Error building Query URL:', error);

        addToast({
            key: 'query.export.urlFailed',
            message: error.message,
            type: 'error'
        });
    }

    try {
        if(!link){
            return;
        }

        const copied = await Utils.copyToClipboard(link);

        if (!copied) {
            addToast({
                key: 'query.export.urlCopyFailed',
                type: 'error'
            });

            return;
        }

        addToast({
            key: 'query.export.urlCopied',
            type: 'success'
        });
    } catch (error) {
        console.error('Error copying Query Url to clipboard:', error);

        addToast({
            key: 'query.export.urlCopyError',
            message: error.message,
            type: 'error'
        });

        return;
    }
}