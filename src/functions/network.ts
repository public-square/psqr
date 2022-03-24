import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';

import { Static } from 'runtypes';

import { setVars, getVars } from './env';
import { DataResponse } from '../types/interfaces';
import { NetworkConfig } from '../types/network';
import { handleRuntypeFail, retrieveFiles, deleteFiles, FileConfig } from './utility';

const homedir = require('os').homedir();

const BASE_PATH = `${homedir}/.config/psqr/network`;
const NET_VAR = 'DEFAULT_NETWORKS';

const domReg = /^(((?!\-))(xn\-\-)?[a-z0-9\-_]{0,61}[a-z0-9]{1,1}\.)*(xn\-\-)?([a-z0-9\-]{1,61}|[a-z0-9\-]{1,30})\.[a-z]{2,}$/

/**
 * Get the network configs of the networks specified.
 * If domain is skipped or false return current default configs.
 * If domain is true return all available configs.
 *
 * @param domains colon separated list of network domains
 * @returns outcome of request including an array of the configs
 */
async function getNetworkConfig(domains: string | boolean = false): Promise<DataResponse> {
    const EVAR = NET_VAR;
    const PATH = BASE_PATH

    // if domains is false, get defaults
    if (domains === false) {
        const resp = getVars(EVAR);
        const evar = resp[EVAR];
        if (typeof evar === 'undefined' || evar === '') {
            return {
                success: false,
                message: `No domains passed and no default found`,
            }
        }
        domains = evar;
    }

    try {
        let domainAr: string[];

        // if domains is true, get all possible configs
        if (domains === true) {
            const resp = readdirSync(PATH);
            if (resp.length === 0) {
                return { success: false, message: `No configs present` }
            }
            domainAr = resp;
        } else {
            domainAr = domains.split(':');
        }

        // make file request array
        const files: FileConfig[] = domainAr.map(i => {
            const config = {
                path: `${PATH}/${i}/config.json`,
                relative: false,
            }
            return config;
        });

        // retrieve files and handle response
        const resp = await retrieveFiles(files);
        if (resp.success === false) return { success: false, message: resp.message }

        // extract configs and respond with success
        const configs = resp.files.map(f => {
            if (typeof f === 'object' && typeof f.data === 'string') {
                return JSON.parse(f.data)
            }
        });
        return {
            success: true,
            message: `Successfully retrieved all requested network configs`,
            data: configs,
        };
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Remove specified networks completely.
 * If a specified network is a default it will be removed
 * from the list of defaults.
 *
 * @param domains colon separated list of network domains
 * @returns outcome of request including an array of the files deleted
 */
async function removeNetworkConfig(domains: string): Promise<DataResponse> {
    const PATH = BASE_PATH;

    // remove any domains that don't have available configs
    const avail = readdirSync(PATH);
    const domainAr = domains.split(':').filter(i => avail.indexOf(i) !== -1);

    // ensure there are domains left to remove
    if (domainAr.length === 0) return { success: false, message: `No Network Configs available to remove` }

    try {
        // remove any defaults
        const defResp = getDefaultNetwork();
        if (defResp.success) {
            const def: string[] = defResp.data;
            const newDef = def.filter(i => domainAr.indexOf(i) === -1).join(':');

            const set = setDefaultNetwork(newDef, true);
            if (set.success === false) {
                return { success: false, message: `Unable to remove default network(s)` };
            }
        }

        // make file request array
        const files: FileConfig[] = domainAr.map(i => {
            const config = {
                path: `${PATH}/${i}`,
                relative: false,
            }
            return config;
        });

        // send request and pass on response
        const resp = await deleteFiles(files);
        return resp;
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Set the default network config(s).
 * Unless indicated otherwise by param overwrite,
 * specified domains will be added to current default list.
 *
 * @param domains colon separated list of network domains
 * @param overwrite should the list of domains completely overwrite current defaults
 * @returns outcome of request including the current defaults
 */
function setDefaultNetwork(domains: string, overwrite = false): DataResponse {
    const EVAR = NET_VAR;
    const PATH = BASE_PATH;

    let msg = '';
    let defaults = domains.split(':');

    // skip getting current value if just overwriting
    if (overwrite === false) {
        const oldVal = getVars(EVAR);
        const ovar = oldVal[EVAR];
        if (typeof ovar === 'string' && ovar !== '') {
            defaults = [...ovar.split(':'), ...defaults];
        }
    }

    // enforce domain name restrictions
    defaults = defaults.filter(i => {
        const test = domReg.test(i);
        if (test === false) msg += `\nRemoved domain ${i} due to invalid characters (must be a valid domain).`
        return test;
    })

    // ensure there are defaults left to add
    if (defaults.length === 0) return { success: false, message: 'All Names provided have invalid characters (must be a valid domain).' }

    // remove any domains that don't have available configs
    const avail = readdirSync(PATH);
    defaults = defaults.filter(i => {
        const test = avail.indexOf(i) > -1;
        if (test === false) msg += `\nRemoved domain ${i} due to no available config.`
        return test
    });

    // ensure there are defaults left to add
    if (defaults.length === 0) return { success: false, message: `No Names provided have available configs. Use network:create to make one.` }

    // remove any duplicate domains
    defaults = [...new Set(defaults)];

    // combine defaults into new value
    const newVal = defaults.join(':');

    // send request and handle response
    const set = setVars(`${EVAR}=${newVal}`);
    if (set === {}) {
        return { success: false, message: `Unable to set default network(s)` };
    }
    return { success: true, message: `Set default network(s) to ${set[EVAR]}` + msg };
}

/**
 * Get an array of the default domains for the network config
 *
 * @returns outcome of request including an array of the default domains
 */
function getDefaultNetwork(): DataResponse {
    const resp = getVars(NET_VAR);

    // if default var for specified network doesn't exist or is empty
    const rvar = resp[NET_VAR];
    if (typeof rvar === 'undefined' || rvar === '') {
        return {
            success: false,
            message: `No Network defaults found`,
            data: [],
        }
    }

    // parse list and return
    return {
        success: true,
        message: `Network defaults found`,
        data: rvar.split(':'),
    }
}

/**
 * Create a Network config and save it.
 * Can be used to update configs as well.
 * 
 * @param config Network config object
 * @returns outcome of creation attempt
 */
function createNetworkConfig(config: Static<typeof NetworkConfig>): DataResponse {
    // ensure domain doesn't contain invalid characters
    if (domReg.test(config.domain) === false) return { success: false, message: 'config.domain contains invalid characters (must be a valid domain).' }

    // set path and ensure it exists
    const PATH = BASE_PATH + '/' + config.domain;
    if (existsSync(PATH) === false) mkdirSync(PATH, { recursive: true });

    try {
        // validate config and then write to file
        NetworkConfig.check(config);
        writeFileSync(`${PATH}/config.json`, JSON.stringify(config))
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: `Successfully created new Network ${config.domain}`,
    }
}

export { getNetworkConfig, removeNetworkConfig, setDefaultNetwork, getDefaultNetwork, createNetworkConfig }
