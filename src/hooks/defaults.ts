import { Hook } from '@oclif/core'
import { persistNetworkSetup } from '../functions/setup';
import { getVars, setVars } from '../functions/env';

const ora = require('ora');

/**
 * Hook - Verifies that Language and Network Defaults exists
 * @returns promise type void
 */
const defaults: Hook<'init'> = async function () {
    const defLang = 'en/US';
    const elang = 'DEFAULT_LANGUAGE';
    const enet = 'DEFAULT_NETWORKS'
    const eVars = getVars([elang,enet]);

    // set lang if no default
    if (typeof eVars[elang] === 'undefined' || eVars[elang] === '') {
        const oraLang = ora(`Setting default language to ${defLang} since it is not set`).start();
        // set language
        const newEnv = setVars(`DEFAULT_LANGUAGE=${defLang}`, false);
        if (newEnv[elang] === defLang) {
            oraLang.succeed(`Default language is now ${defLang}`)
        } else {
            oraLang.fail(`Unable to set default language. Please try manually with the command: \n\npsqr env --set="${elang}='${defLang}'"`)
        }
    }

    // set network if no defaults
    if (typeof eVars[enet] === 'undefined' || eVars[enet] === '') {
        // set default network
        const netSetup = {
            name: 'Ology Newswire',
            domain: 'ology.com',
            identityDomains: [
                'did:psqr:id.ology.com'
            ],
            api: 'https://broadcast.ology.com/api'
        }
        const oraNet = ora(`Setting default network to ${netSetup.domain} since it is not set`).start();
        const netResp = await persistNetworkSetup(netSetup, null, true)
        if (netResp.success) {
            oraNet.succeed(`Default network is now ${netSetup.domain}`);
        } else {
            oraNet.fail(`Network setup failed because: ${netResp.message}. ` +
                `Please try manually with these commands: \n\n` +
                `psqr network:create ${netSetup.domain} '${netSetup.name}' --api="${netSetup.api}"\n` +
                `psqr network:default ${netSetup.domain}`
            );
        }
    }
}

export default defaults;
