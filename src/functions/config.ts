import { Static } from 'runtypes';

import { PsqrConfig } from '../types/config';
import { Did, Identity } from '../types/identity';
import { DataResponse } from '../types/interfaces';
import { addIdentity, getFullIdentity, setDefaultIdentity } from './identity';
import { createNetworkConfig, getNetworkConfig, setDefaultNetwork } from './network';
import { handleRuntypeFail } from './utility';

export interface ExportOptions {
    did: string;
    network?: string;
}

async function exportPsqrConfig(options: ExportOptions): Promise<DataResponse> {
    // get identity object
    const idResp = await getFullIdentity(options.did);
    if (idResp.success === false) {
        return {
            success: false,
            message: 'Unable to get Identity because: ' + idResp.message,
        }
    }

    // get network config
    const netResp = await getNetworkConfig(options.network || false);
    if (netResp.success === false && typeof options.network !== 'undefined') {
        return {
            success: false,
            message: 'Unable to get Network because: ' + netResp.message,
        }
    }

    try {
        const identity = Identity.check(idResp.identity);
        const network: any = {};

        // add all of the successful network configs
        if (netResp.success && netResp.data.length === 1) {
            network.config = netResp.data[0];
        }

        
        // get name and validate didDoc
        const didDoc = Did.check(identity.didDoc);
        const name = didDoc.psqr.publicIdentity.name;
        
        // assemble all the components
        const config = PsqrConfig.check({
            name: name,
            identity: identity,
            network: network,
        });

        return {
            success: true,
            message: `Successfully exported the full config for DID: ${options.did}`,
            data: config,
        }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

async function importPsqrConfig(config: Static<typeof PsqrConfig>, setDefault = false, key = ''): Promise<DataResponse> {
    // validate config
    try {
        PsqrConfig.check(config);
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // add identity
    const idResp = await addIdentity(config.identity);
    if (idResp.success === false) {
        return {
            success: false,
            message: `Unable to add Identity because: ${idResp.message}`,
        }
    }

    // set as default identity if necessary
    if (setDefault && key !== '') {
        const defIdResp = setDefaultIdentity(config.identity.did + '#' + key);
        if (defIdResp.success === false) {
            return {
                success: false,
                message: `Unable to set default Identity because: ${defIdResp.message}`,
            }
        }
    }

    // import network config
    const netConfig = config.network.config;
    // attempt to add network config
    const netResp = createNetworkConfig(netConfig);
    if (netResp.success === false) {
        return {
            success: false,
            message: `Unable to add Network because: ${netResp.message}`,
        }
    }

    // set network as default
    if (setDefault) {
        const defNetResp = setDefaultNetwork(netConfig.domain);
        if (defNetResp.success === false) {
            return {
                success: false,
                message: `Unable to set default Network because: ${defNetResp.message}`,
            }
        }
    }

    return {
        success: true,
        message: 'Successfully imported config',
    }
}

export { exportPsqrConfig, importPsqrConfig }
