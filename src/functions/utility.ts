// @ts-ignore: rmSync is available despite warnings
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync, rmSync } from 'fs';

import { DataResponse, ProxyConfig } from '../types/interfaces'
import { Url } from '../types/base-types'

const parseDuration = require('parse-duration');
const axios = require('axios').default;
const proxyAgent = require('https-proxy-agent');

/** File Configuration */
export interface FileConfig {
    path: string;
    relative: boolean;
    data?: string | object;
}

export interface FileResponse extends DataResponse {
    files: string[] | FileConfig[];
}

/**
 * Asynchronously create files at their specified paths.
 * Response data is returned once all files have been created, or if there is an error.
 *
 * @param files list of files (path and data) to be created
 * @param lgr logger function to log activity
 * @returns Success or Failure Message and Files
 */
async function createFiles(files: FileConfig[], lgr: Function = () => { /* no log */ }): Promise<FileResponse> {
    const newFiles = [];
    const response: FileResponse = {
        success: false,
        message: 'No files were created',
        files: [],
    }

    // process each file config and make a file create promise
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const path = file.relative ? process.cwd() + '/' + file.path : file.path;
        const data = typeof file.data === 'string' ? file.data : JSON.stringify(file.data);

        newFiles.push(createFilePromise(path, data, lgr))
    }

    // once all files have been created or it fails, return a response
    return Promise.all(newFiles).then(value => {
        response.success = true;
        response.files = value;
        response.message = 'Successfully created all files';

        return response;
    }).catch(error => {
        response.message = error.message;

        return response;
    });
}

/**
 * Append a timestamp to a log file as a newline.
 *
 * @param file log file path and string to append
 * @returns Success or Failure Message
 */
function appendLogFile(file: FileConfig): DataResponse {
    const path = file.relative ? process.cwd() + '/' + file.path : file.path;
    const data = '\n' + Date.now() + ': ' + file.data;

    try {
        appendFileSync(path, data);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return { success: true, message: 'Added to log file ' + path }
}

/**
 * Generate a logger to pass a string to a file.
 * Empty strings will return as a line divider.
 *
 * @param path absolute path to log file
 * @returns logger function
 */
function generateLogger(path: string): Function {
    return (data: any, divider = false) => {
        // console.log(data);
        if (data === undefined) return;
        // add divider before if true
        if (divider) {
            appendLogFile({
                path,
                relative: false,
                data: '------------------------------------------------------------------------',
            });
        }
        if (typeof data !== 'string') {
            data = JSON.stringify(data, null, 4);
        }
        appendLogFile({ path, relative: false, data })
    }
}

/**
 * Asynchronously delete files at their specified paths.
 * Response data is returned once all files have been deleted, or if there is an error.
 *
 * @param files list of files (path) to be deleted
 * @param lgr logger function to log activity
 * @returns Success or Failure Message and list of deleted files
 */
async function deleteFiles(files: FileConfig[], lgr: Function = () => { /* no log */ }): Promise<FileResponse> {
    const removedFiles = [];
    const response: FileResponse = {
        success: false,
        message: 'No files were removed',
        files: [],
    }

    // process each file config and make a file delete promise
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const path = file.relative ? process.cwd() + '/' + file.path : file.path;

        removedFiles.push(deleteFilePromise(path, lgr))
    }

    // once all files have been deleted or it fails, return a response
    return Promise.all(removedFiles).then(value => {
        response.success = true;
        response.files = value;
        response.message = 'Successfully deleted all files';
        lgr(response.message);

        return response;
    }).catch(error => {
        response.message = error.message;
        lgr(response.message);

        return response;
    });
}

/**
 * Asynchronously delete all files in a specified directory
 * that match a specified regular expression.
 * This uses regex.test() to determine if it should be deleted.
 * This does not search for files recursively.
 *
 * @param regex regular expression matching files you want deleted
 * @param dir root directory that the files are all in
 * @param lgr logger function to log activity
 * @returns outcome of request and all files deleted
 */
async function deleteRegFiles(regex: RegExp, dir: FileConfig, lgr: Function = () => { /* no log */ }): Promise<FileResponse> {
    let selected: string[];
    let rootPath: string;

    try {
        // get a list of all available files
        rootPath = dir.relative ? process.cwd() + '/' + dir.path : dir.path;
        const available = readdirSync(rootPath);

        // filter out those that don't match the regex
        selected = available.filter(f => regex.test(f));
    } catch (error: any) {
        lgr('Unable to delete files because: ' + error.message)
        return {
            success: false,
            message: error.message,
            files: [],
        }
    }

    // make list of fileconfigs and delete files
    const list: FileConfig[] = selected.map(f => {
        const path = rootPath === '' ? f : `${rootPath}/${f}`;
        return {
            path,
            relative: dir.relative,
        }
    })

    const deleteStatus = await deleteFiles(list, lgr)

    return deleteStatus;
}

/**
 * Asynchronously retrieve content of files at their specified paths.
 * Response data is returned once all files have been retrieved, or if there is an error.
 *
 * @param files list of files (path) to get the contents of
 * @returns Success or Failure Message and all file data
 */
async function retrieveFiles(files: FileConfig[]): Promise<FileResponse> {
    const fileData = [];
    const response: FileResponse = {
        success: false,
        message: 'No files were retrieved',
        files: [],
    }

    // process each file config and make a file get promise
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        const path = file.relative ? process.cwd() + '/' + file.path : file.path;

        fileData.push(getFilePromise(path))
    }

    // once all files have been retrieved or it fails, return a response
    return Promise.all(fileData).then(value => {
        response.success = true;
        response.files = value;
        response.message = 'Successfully retrieved all files';

        return response;
    }).catch(error => {
        response.message = error.message;

        return response;
    });
}

/**
 * Asynchronously retrieve all files in a specified directory
 * that match a specified regular expression.
 * This uses regex.test() to determine if it should be included.
 * This does not search for files recursively.
 *
 * @param regex regular expression matching files you want included
 * @param dir root directory that the files are all in
 * @returns outcome of request and all file data
 */
async function retrieveRegFiles(regex: RegExp, dir: FileConfig): Promise<FileResponse> {
    let selected: string[];
    let rootPath: string;

    try {
        // get a list of all available files
        rootPath = dir.relative ? process.cwd() + '/' + dir.path : dir.path;
        const available = readdirSync(rootPath);

        // filter out those that don't match the regex
        selected = available.filter(f => regex.test(f));
    } catch (error: any) {
        return {
            success: false,
            message: error.message,
            files: [],
        }
    }

    // make list of fileconfigs and get files
    const list: FileConfig[] = selected.map(f => {
        const path = rootPath === '' ? f : `${rootPath}/${f}`;
        return {
            path,
            relative: dir.relative,
        }
    })

    const retrieveStatus = await retrieveFiles(list);

    return retrieveStatus;
}

/**
 * Handles RunType Failures and returns a human readable message.
 * If PSQR_ENV is set to debug, this will output a stack trace.
 *
 * @param error error object to manage
 * @returns proper error message to use
 */
function handleRuntypeFail(error: Error | any): string {
    let msg = 'Error: ';

    // include stack trace if set
    if (process.env.PSQR_ENV === 'debug') {
        console.error(error);
        msg = error.stack + '\n' + msg;
    }

    switch (error) {
        case typeof error.details !== 'undefined':
            msg += '\n' + JSON.stringify(error.details, null, 4);
            break;
        case typeof error.result?.error !== 'undefined':
            msg += error.result.error;
            break;
        case typeof error.message !== 'undefined':
            msg += error.message;
            break;
        default:
            msg += 'No message available';
    }

    return msg;
}

/**
 * Generate a Promise to delete files.
 *
 * @param file absolute path to file
 * @param lgr logger function to log activity
 * @returns Promise object for deleting the specified file
 */
function deleteFilePromise(file: string, lgr: Function = () => { /* no log */ }): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            rmSync(file, { recursive: true });

            // log file creation
            lgr('Successfully deleted file ' + file);

            resolve(file)
        } catch (error: any) {
            // log error
            lgr(`Unable to delete file ${file} due to error: ${error.message}`);
            reject(error)
        }
    })
}

/**
 * Generate a promise to create a specified file with data
 *
 * @param file absolute path to new file
 * @param data content of new file
 * @param lgr logger function to log activity
 * @returns Promise object for creating the file
 */
function createFilePromise(file: string, data: string, lgr: Function = () => { /* no log */ }): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const path = file.substring(0, file.lastIndexOf('/'));
            if (existsSync(path) === false) mkdirSync(path);

            writeFileSync(file, data);

            // log file creation
            lgr('Successfully created file ' + file);

            resolve(file)
        } catch (error: any) {
            // log error
            lgr(`Unable to create file ${file} due to error: ${error.message}`);
            reject(error)
        }
    })
}

/**
 * Generate a promise to retrieve content of a specified file
 *
 * @param path absolute path to file
 * @returns Promise object for retrieving the file
 */
function getFilePromise(path: string): Promise<FileConfig> {
    return new Promise((resolve, reject) => {
        try {
            const data = readFileSync(path).toString();
            const resp = {
                path,
                relative: false,
                data,
            }

            resolve(resp)
        } catch (error: any) {
            reject(error)
        }
    })
}

/**
 * Run all concurrent promises on an array of data.
 * Set a limit to determine how many can run at the same time.
 *
 * @param args array of arrays containing params for each run
 * @param func function to run concurrently that returns a promise
 * @param limit how many concurrent promises should be running
 * @returns array containing results
 */
async function concurrentPromises(args: any[][], func: (...args: any[]) => Promise<any>, limit = 10): Promise<any[]> {
    const pool = args;
    const failed: string[] = [];

    const promisePool: any[] = [];
    for (let i = 0; i < limit; i++) {
        // since we are running async functions concurrently this is necessary
        // eslint-disable-next-line no-async-promise-executor
        const promiseSet = new Promise(async (resolve, reject) => {
            const results = [];

            while (pool.length > 0) {
                const params = pool.pop();
                if (params !== undefined) {
                    try {
                        const resp = await func(...params);
                        results.push(resp);
                    } catch (error: any) {
                        failed.push(error.message);
                    }
                }
            }

            resolve(results);
            reject(new Error('Concurrent promises failed'));
        });

        promisePool.push(promiseSet);
    }

    const settledPool = await Promise.allSettled(promisePool);
    // console.log(`${failed.length} failed promises`);
    // console.log(new Set(failed));

    const results = settledPool.map(r => {
        if (r.status === 'fulfilled') {
            return r.value;
        }

        return null;
    }).flat();

    return results;
}

/**
 * Get the redirect url to determine a final destination of a url string.
 * If a proxyConfig is specified and the first attempt times out
 * a second attempt will be made using the proxy.
 *
 * @param url url that will redirect
 * @param proxyConfig config object for proxy service to use
 * @param forceProxy force the proxy to be used the first time instead of on the second attempt
 * @returns success of attempt and redirect url
 */
async function getRedirectUrl(url: string, proxyConfig: ProxyConfig = false, forceProxy = false): Promise<DataResponse> {
    try {
        // ensure string is url
        Url.check(url);

        // setup default config with timeout
        const config: any = {
            maxRedirects: 10,
            timeout: 1 * 60 * 1000,
        }

        // add proxy if necessary
        if (proxyConfig !== false && forceProxy) {
            config.httpsAgent = new proxyAgent(proxyConfig);
        }

        const resp = await axios.get(url, config);

        return {
            success: true,
            message: 'Successfully found the redirect url',
            data: resp.request.res.responseUrl,
        }
    } catch (error: any) {
        if (error.code === 'ECONNABORTED' && proxyConfig !== false && forceProxy === false) {
            const redirectUrl = await getRedirectUrl(url, proxyConfig, true);
            return redirectUrl;
        }
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

function convertSinceToTimestamp(since = ''): number {
    if (since === '') return Date.now();

    // calculate new timestamp
    const diff = parseDuration(since);
    const ts = Date.now() - diff;

    return ts;
}

export { createFiles, deleteFiles, deleteRegFiles, retrieveFiles, retrieveRegFiles, handleRuntypeFail, appendLogFile, generateLogger, concurrentPromises, getRedirectUrl, convertSinceToTimestamp }
