import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const dotenv = require('dotenv');
const homedir = require('os').homedir();

const ENV_DIR = `${homedir}/.config/psqr`
const ENV_PATH = `${ENV_DIR}/.npmrc`;
const POSSIBLE_VARS = [
    'DEFAULT_DID',
    'DEFAULT_KEY',
    'DEFAULT_LANGUAGE',
    'ALLOW_SELF_SIGNED',
    'DEFAULT_NETWORKS',
    'DEFAULT_RSS',
    'DEFAULT_TWITTER',
    'DEFAULT_WEBHOSE',
    'DEFAULT_SITEMAP',
    'TWITTER_TOKEN',
    'PROXY_HOST',
    'PROXY_PORT',
    'PROXY_USER',
    'PROXY_PASS',
    'PSQR_ENV',
    'WEBHOSE_TOKEN',
    'HISTORY_LIMIT',
];

export interface EnvVars {
    DEFAULT_DID?: string;
    DEFAULT_KEY?: string;
    DEFAULT_LANGUAGE?: string;
    ALLOW_SELF_SIGNED?: string;
    DEFAULT_NETWORKS?: string;
    DEFAULT_RSS?: string;
    DEFAULT_TWITTER?: string;
    DEFAULT_WEBHOSE?: string;
    DEFAULT_SITEMAP?: string;
    TWITTER_TOKEN?: string;
    PROXY_HOST?: string;
    PROXY_PORT?: string;
    PROXY_USER?: string;
    PROXY_PASS?: string;
    PSQR_ENV?: string;
    WEBHOSE_TOKEN?: string;
    HISTORY_LIMIT?: string;
}

/**
 * Check for the existance of the env file.
 * Try to create it if it doesn't exist.
 *
 * @returns boolean verification of existence
 */
function checkForEnv(): boolean {
    try {
        if (existsSync(ENV_PATH) === false) {
            mkdirSync(ENV_DIR, { recursive: true });
            writeFileSync(ENV_PATH, '');
        }

        return true
    } catch (error: any) {
        console.error(error)
        return false
    }
}

/**
 * Set environment variables as specified.
 * This will completely override the ENV vars and
 * there are no checks in place for the validity
 * of the new values specified.
 *
 * @param vars comma separated list of vars and their values
 * @param file vars param is a file path to the vars list
 * @returns obj containing current env values if successful
 */
function setVars(vars: string, file = false): EnvVars {
    // ensure config file exists
    if (checkForEnv() === false) return {};

    // get current vars
    const sVars = dotenv.parse(readFileSync(ENV_PATH));
    let nVars: Record<string, any> = {};

    // if true, retrieve vars from file specified by the vars param
    if (file) {
        nVars = dotenv.parse(readFileSync(vars));
    } else { // otherwise parse the vars and their values from the string
        const nArr = vars.split(',');
        nArr.forEach(v => {
            const newVar = v.split('=');
            nVars[newVar[0]] = newVar[1];
        });
    }

    // overwrite current var values with new values
    for (const key in nVars) {
        if (Object.prototype.hasOwnProperty.call(nVars, key)) {
            // ensure new var is a possible var
            if (POSSIBLE_VARS.includes(key) === false) {
                continue;
            }

            sVars[key] = nVars[key];
        }
    }

    // combine vars into a readable string for the ENV file
    let fileData = '';
    for (const key in sVars) {
        if (Object.prototype.hasOwnProperty.call(sVars, key)) {
            fileData += `${key}=${sVars[key]}\n`;
        }
    }

    // save string to ENV file
    writeFileSync(ENV_PATH, fileData);

    return dotenv.parse(fileData);
}

/**
 * Get the values of desired ENV vars.
 * You can specify a comma separated list or an array.
 * Defaults to retrieving values of all possible vars.
 *
 * @param vars ENV var(s) to retrieve the values of
 * @returns obj containing specified vars and their values
 */
function getVars(vars: string | string[] = POSSIBLE_VARS): EnvVars {
    // ensure config file exists
    if (checkForEnv() === false) return {};

    // get current vars
    const env = dotenv.config({ path: ENV_PATH }).parsed;

    // parse out comma separated list if necessary
    if (typeof vars === 'string') {
        vars = vars.split(',');
    }

    // ensure each requested var is a possible var
    const response: { [key: string]: string } = {};
    vars.forEach(v => {
        if (POSSIBLE_VARS.includes(v) === false) {
            return;
        }

        if (env[v] !== null) response[v] = env[v];
    });

    return response;
}

export { POSSIBLE_VARS, setVars, getVars };
