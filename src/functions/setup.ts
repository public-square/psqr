import { Static } from 'runtypes';

import { createIdentity, addIdentity, getDid, addNewKeyPair, IdentityResponse, addExistingKeyPair, setDefaultIdentity } from './identity';
import { FileConfig, handleRuntypeFail, retrieveFiles } from './utility';
import { setVars } from './env';
import { DataResponse } from '../types/interfaces';
import { Identity, KeyPair, PublicInfo } from '../types/identity';
import { NetworkConfig } from '../types/network';
import { createNetworkConfig, setDefaultNetwork } from './network';
import { crawlTypes, CrawlType, writeRSSCrawl, writeSitemapCrawl, writeTwitterCrawl, writeWebhoseCrawl, setDefaultCrawl } from './crawl';
import { Crawl, RSS, Sitemap, Twitter, Webhose } from '../types/crawl';

const inquirer = require('inquirer');

// Set some constants used by multiple functions
const idChoices = [
    'Create a new Identity',
    'Add a pre-existing Identity'
];

const keyImportChoices = [
    'Create a new key',
    'Import a pre-existing key'
];

const defaultTwitterToken = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Prompt the user for info on how they want to setup their Identity
 *
 * @returns idSetup reponse object with combined responses
 */
async function promptIdentitySetup(): Promise<any> {
    // only able to add or create right now
    const addId = await inquirer.prompt({
        type: 'list',
        name: 'idImport',
        message: 'Do you want to create a new Identity or add a pre-existing one?',
        choices: idChoices,
        default: 0
    });

    let idSetup = {...addId};
    switch (addId.idImport) {
        // add identity option
        case idChoices[1]:
            const didPrompt = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'did',
                    message: 'What is the DID string of the identity you are adding?'
                },
                {
                    type: 'list',
                    name: 'keyImport',
                    message: 'Do you want to create a new key and add it to this Identity or import a pre-existing key?',
                    choices: keyImportChoices,
                    default: 0
                }
            ]);
            idSetup = {
                ...idSetup,
                ...didPrompt
            };

            // If creating new keys prompt the user
            const keyQuery = [];
            if (didPrompt.keyImport === keyImportChoices[0]) {
                keyQuery.push({
                    type: 'input',
                    name: 'keyName',
                    message: 'What is the name of the key you wish to create and add to this Identity (usually admin, publish, list, or curate)?'
                });
            } else {
                keyQuery.push({
                    type: 'input',
                    name: 'keyPath',
                    message: 'What is the relative path to the key pair you wish to use from this Identity? Expected files are private.jwk and public.jwk.'
                })
            }
            const keyPrompt = await inquirer.prompt(keyQuery);
            idSetup = {
                ...idSetup,
                ...keyPrompt
            };
            break;
        // create identity option
        case idChoices[0]:
        default:
            const newDidPrompt = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'did',
                    message: 'What is the DID string of the Identity you are creating?'
                },
                {
                    type: 'input',
                    name: 'idName',
                    message: 'What is the Full Name for the Identity you are creating?'
                },
                {
                    type: 'input',
                    name: 'keyNames',
                    message: 'What are the comma separated names of the keys you want to be created along with this Identity (usually admin, publish, list, or curate)?'
                }
            ]);
            idSetup = {
                ...idSetup,
                ...newDidPrompt
            }
            break;
    }

    return idSetup;
}

/**
 * Take identity setup and create or import the identity as specified,
 * then save that identity as the default
 *
 * @param idSetup inquirer response object containing responses from promptIdentitySetup
 * @param oraOutput ora variable to update with appropriate status message
 * @returns identity response with full identity if successful
 */
async function persistIdentitySetup(idSetup: any, oraOutput: any): Promise<IdentityResponse> {
    // determine user readable description of setup
    let idDesc = `\nThis will ${ idSetup.idImport } with a DID of ${ idSetup.did }`;
    switch (idSetup.idImport) {
        // add identity option
        case idChoices[1]:
            idDesc += `.\n`;
            if (idSetup.keyImport === keyImportChoices[0]) {
                idDesc += `It will create a key for this Identity called ${ idSetup.keyName }.\n`;
            } else {
                idDesc += `It will import a key for this Identity located at ${ idSetup.keyPath }.\n`;
            }
            break;
        // create identity option
        case idChoices[0]:
        default:
            idDesc += ` and a Full Name of ${ idSetup.idName }.\n`;
            idDesc += `It will create keys for this Identity with the names ${ idSetup.keyNames }.\n`;
            break;
    }
    console.log(idDesc);

    // confirm user choice
    const confirmation = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to setup your identity as described?',
        default: true
    });
    if (confirmation.confirm === false) {
        return {
            success: false,
            message: 'User cancelled Identity setup'
        }
    }

    // continue Identity setup
    const statusText = idSetup.idImport === idChoices[1] ? 'Adding pre-existing Identity...' : 'Creating new Identity...';
    oraOutput.start(statusText);

    // create Identity
    let identity: Static<typeof Identity>;
    switch (idSetup.idImport) {
        // add identity option
        case idChoices[1]:
            const dResp = await getDid(idSetup.did);
            if (dResp.success === false) {
                const msg = handleRuntypeFail(dResp.error);
                return {
                    success: false,
                    message: msg
                };
            }
            const didDoc = dResp.didDoc;

            // start identity
            identity = {
                did: idSetup.did,
                didDoc,
                keyPairs: [],
            }

            // get keys based on input
            if (idSetup.keyImport === keyImportChoices[0]) {
                const kid = idSetup.did + '#' + idSetup.keyName;

                // create a new key based on kid and add it to the identity
                const nkResp = await addNewKeyPair(identity, kid);
                if (nkResp.success === false) return nkResp;

                identity = nkResp.identity;
            } else {
                // generate config for both keys
                const privPath = idSetup.keyPath + '/private.jwk';
                const pubPath = idSetup.keyPath + '/public.jwk';
                const failureResp: IdentityResponse = {
                    success: false,
                    message: 'Unable to find keys at ' + idSetup.keyPath
                };
                const kf: FileConfig[] = [
                    {
                        path: privPath,
                        relative: true,
                    },
                    {
                        path: pubPath,
                        relative: true,
                    },
                ]
                const kfResp = await retrieveFiles(kf);
                if (kfResp.success === false) return failureResp;

                // separate out key files
                let privKey, pubKey;
                for (let i = 0; i < kfResp.files.length; i++) {
                    const f = kfResp.files[i];

                    if (typeof f === 'string' || typeof f.data !== 'string') continue;
                    if (f.path.includes(privPath)) {
                        privKey = f.data;
                    } else if (f.path.includes(pubPath)) {
                        pubKey = f.data;
                    }
                }
                if (typeof privKey === 'undefined' || typeof pubKey === 'undefined') {
                    return failureResp;
                }

                // assemble and validate new key pair
                let fileKeyPair: Static<typeof KeyPair>;
                const kid = JSON.parse(privKey).kid;
                try {
                    fileKeyPair = KeyPair.check({
                        kid,
                        private: JSON.parse(privKey),
                        public: JSON.parse(pubKey),
                    })
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return {
                        success: false,
                        message: msg
                    };
                }

                // add existing key to current identity
                const fkResp = await addExistingKeyPair(identity, fileKeyPair, true);
                if (fkResp.success === false) {
                    return {
                        success: false,
                        message: fkResp.message
                    };
                };

                identity = fkResp.identity;
            }
            break;
        // create identity option
        case idChoices[0]:
        default:
            let keyNames: string[] = [];
            if (idSetup.keyNames !== '' && idSetup.keyNames.split(',').length > 0) {
                keyNames = idSetup.keyNames.split(',');
            }
            const info: Static<typeof PublicInfo> = {
                name: idSetup.idName,
            };

            // validate publicIdentity
            try {
                PublicInfo.check(info)
            } catch (error) {
                const msg = handleRuntypeFail(error);
                oraOutput.fail(msg);
                return {
                    success: false,
                    message: msg
                };
            }

            const newIdResp = await createIdentity(idSetup.did, info, keyNames);
            if (newIdResp.success === false) return newIdResp;

            // save created identity
            identity = newIdResp.identity;
            break;
    }

    // store full identity
    const addResp = await addIdentity(identity);
    if (addResp.success === false) {
        return {
            success: false,
            message: addResp.message
        };
    }

    // set default identity
    const defKid = identity.keyPairs[0].kid;
    const defResp = setDefaultIdentity(defKid);
    if (defResp.success === false) {
        return {
            success: false,
            message: defResp.message
        };
    }

    const idResp: IdentityResponse = {
        ...addResp,
        identity: identity
    }

    return idResp;
}

/**
 * Prompt the user for info on the network they want to add
 *
 * @returns netSetup response object with combined responses
 */
async function promptNetworkSetup(): Promise<any> {
    // get all network variables
    const networkPrompt = await inquirer.prompt([
        {
            type: 'input',
            name: 'domain',
            message: 'What is the domain of the network you wish to add?'
        },
        {
            type: 'input',
            name: 'name',
            message: 'What is the user friendly name of the network you wish to add?'
        }
    ]);

    const apiDefault = `https://${networkPrompt['domain']}/api`;
    const apiPrompt = await inquirer.prompt([
        {
            type: 'input',
            name: 'api',
            message: 'What is the full url for the api endpoint of the network you wish to add?',
            default: apiDefault
        }
    ]);

    return {
        ...networkPrompt,
        ...apiPrompt
    }
}

/**
 * Take the network setup and add it to psqr,
 * then save it as the default
 *
 * @param netSetup inquirer response object containing responses from promptNetworkSetup
 * @param oraOutput ora variable to update with appropriate status message
 * @param force skip any confirmation and ora output and just persist
 * @returns data response describing success
 */
async function persistNetworkSetup(netSetup: any, oraOutput: any, force = false): Promise<DataResponse> {
    // setup network config to persist
    let config: Static<typeof NetworkConfig>;
    try {
        config = NetworkConfig.check({
            name: netSetup['name'],
            domain: netSetup['domain'],
            content: {
                search:  {
                    url: `https://search.${netSetup['domain']}`
                },
                list:   {
                    url: `https://list.${netSetup['domain']}`
                },
                feed:   {
                    url: `https://feed.${netSetup['domain']}`
                },
                link:   {
                    url: `https://link.${netSetup['domain']}`
                },
                beacon:   {
                    url: `https://beacon.${netSetup['domain']}`
                }
            },
            services: {
                api:   {
                    url: netSetup['api'],
                }
            }
        })
    } catch (error) {
        const msg = 'Failed to assemble network config because: ' +handleRuntypeFail(error);
        if (force === false) oraOutput.fail(msg);

        return {
            success: false,
            message: msg
        }
    }

    // determine user readable description of setup
    let networkDesc = `\nThis will add the network config: \n${JSON.stringify(config, null, 4)}\n`;
    if (force === false) console.log(networkDesc);

    // confirm user choice
    if (force === false) {
        const confirmation = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to add the network config as described?',
            default: true
        });
        if (confirmation.confirm === false) {
            return {
                success: false,
                message: 'User cancelled Network setup'
            }
        }
    }

    // save network config
    if (force === false) oraOutput.start('Adding network config...')
    const addResp = createNetworkConfig(config);
    if (addResp.success === false) {
        if (force === false) oraOutput.fail(addResp.message)
        return addResp;
    }

    // set network config as default
    if (force === false) oraOutput.start('Setting network config as default...')
    const defResp = setDefaultNetwork(config.domain);
    if (defResp.success === false) {
        if (force === false) oraOutput.fail(defResp.message)
        return defResp;
    }

    return {
        success: true,
        message: 'Successfully added the Network Config'
    }
}

/**
 * Prompt the user for account values for the proxy they want to use
 *
 * @returns proxySetup response object with combined responses
 */
async function promptProxySetup(): Promise<any> {
    // get all proxy variables
    const proxyPrompt = await inquirer.prompt([
        {
            type: 'input',
            name: 'PROXY_HOST',
            message: 'What is the domain or host of the proxy you wish to use?'
        },
        {
            type: 'input',
            name: 'PROXY_PORT',
            message: 'What is the port of the proxy you wish to use?'
        },
        {
            type: 'input',
            name: 'PROXY_USER',
            message: 'What is the account username of the proxy you wish to use?'
        },
        {
            type: 'input',
            name: 'PROXY_PASS',
            message: 'What is the account password of the proxy you wish to use?'
        }
    ]);

    return proxyPrompt;
}

/**
 * Take the proxy setup and save those values as env vars
 *
 * @param proxySetup inquirer response object containing responses from promptProxySetup
 * @returns data response describing success
 */
async function persistProxySetup(proxySetup: any): Promise<DataResponse> {
    // determine user readable description of setup
    let proxyDesc = `\nThis will save the proxy variables: \n${JSON.stringify(proxySetup, null, 4)}\n`;
    console.log(proxyDesc);

    // confirm user choice
    const confirmation = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to setup your proxy as described?',
        default: true
    });
    if (confirmation.confirm === false) {
        return {
            success: false,
            message: 'User cancelled Proxy setup'
        }
    }

    let varString = '';
    let index = 0;
    for (const key in proxySetup) {
        if (Object.prototype.hasOwnProperty.call(proxySetup, key)) {
            const value = proxySetup[key];
            if (index > 0) {
                varString += ','
            }
            varString += `${key}=${value}`;

            index++
        }
    }
    const proxySave = setVars(varString, false);

    for (const key in proxySetup) {
        if (Object.prototype.hasOwnProperty.call(proxySave, key) === false) {
            return {
                success: false,
                message: 'Some of the Proxy variables were not set correctly'
            }
        }
    }

    return {
        success: true,
        message: 'Successfully setup Proxy'
    }
}

/**
 * Prompt the user for info on what crawls they want to add.
 * This will go through one and then ask the user if they want to add another until they say no.
 *
 * @param identity identity object that was generated earlier by the user
 * @returns crawlSetup response array with info for all requested crawls
 */
async function promptCrawlSetup(identity: Static<typeof Identity>): Promise<any[]> {
    let continueSetup = false;
    let webhosePrompted = false;
    let twitterPrompted = false;
    let results = []
    do {
        // determine crawl to be added
        const kids = identity.keyPairs.map(p => p.kid);
        const typePrompt = await inquirer.prompt([
            {
                type: 'list',
                name: 'crawlType',
                message: 'What is the type of the crawl config you want to add?',
                choices: crawlTypes,
                default: 0
            },
            {
                type: 'list',
                name: 'kid',
                message: 'Which KID do you want to use with this crawl?',
                choices: kids,
                default: 0
            }
        ]);

        const type: CrawlType = typePrompt.crawlType;
        let result = {...typePrompt};

        // get tokens if necessary
        if (type === 'twitter' && twitterPrompted === false) {
            const twitterToken = await inquirer.prompt(
                {
                    type: 'input',
                    name: 'token',
                    message: 'What is the token for the twitter api?',
                    default: defaultTwitterToken
                }
            );
            result = {
                ...result,
                ...twitterToken
            }
        } else if (type === 'webhose' && webhosePrompted === false) {
            const webhoseToken = await inquirer.prompt(
                {
                    type: 'input',
                    name: 'token',
                    message: 'What is the token for your webhose account?'
                }
            );
            result = {
                ...result,
                ...webhoseToken
            }
        }

        // get type specific values
        switch (type) {
            case 'rss':
                const rssPrompt = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'url',
                        message: 'What is the URL of the RSS feed you want to crawl?'
                    }
                ]);

                result = {
                    ...result,
                    ...rssPrompt
                };
                break;
            case 'sitemap':
                const sitemapPrompt = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'url',
                        message: 'What is the URL of the website sitemap you want to crawl?'
                    }
                ]);

                result = {
                    ...result,
                    ...sitemapPrompt
                };
                break;
            case 'twitter':
                const twitterPrompt = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'username',
                        message: 'What is the username of the twitter profile you want to crawl?'
                    }
                ]);


                result = {
                    ...result,
                    ...twitterPrompt
                };
                break;
            case 'webhose':
                const webhosePrompt = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'username',
                        message: 'What is the username of your webhose account?'
                    },
                    {
                        type: 'input',
                        name: 'url',
                        message: 'What is the URL of the website you want to crawl with webhose?'
                    }
                ]);

                result = {
                    ...result,
                    ...webhosePrompt
                };
                break;
            default:
                return [];
        }

        results.push(result);

        // ask if they want to add another crawl config
        const confirmation = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to add another crawl config?',
            default: false
        });

        continueSetup = confirmation.confirm;
    } while (continueSetup);

    return results;
}

/**
 * Loop throught the provided crawl setups and create the appropriate crawl configs,
 * then save them as the defaults.
 *
 * @param crawlSetup array of inquirer response objects containing responses from promptCrawlSetup
 * @param oraOutput ora variable to update with appropriate status message
 * @returns data response describing success
 */
async function persistCrawlSetup(crawlSetup: any[], oraOutput: any): Promise<DataResponse> {
    // determine user readable description of setup
    let crawlDesc = `\nThis will add the following crawl configs: \n${JSON.stringify(crawlSetup, null, 4)}\n`;
    console.log(crawlDesc);

    // confirm user choice
    const confirmation = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to add the crawl configs as described?',
        default: true
    });
    if (confirmation.confirm === false) {
        return {
            success: false,
            message: 'User cancelled Crawl setup'
        }
    }

    // determine did for default config
    const did = crawlSetup[0].kid.replace(/#.+/, '');

    oraOutput.start(`Saving ${crawlSetup.length} crawl configs...`);
    for (let i = 0; i < crawlSetup.length; i++) {
        const configParams = crawlSetup[i];

        const configBase = {
            type: configParams.crawlType,
            kid: configParams.kid,
            defaults: {},
            lastPost: ''
        };

        const type: CrawlType = configParams.crawlType;
        oraOutput.start(`Saving ${type} crawl config...`);

        switch (type) {
            case 'rss':
                const rssConfig: Static<typeof RSS> = {
                    ...configBase,
                    url: configParams.url,
                    etag: ''
                }

                // store crawl config
                const rssResp = writeRSSCrawl(rssConfig);
                if (rssResp.success === false) return rssResp;

                // add crawl to defaults
                const rssDef = setDefaultCrawl('rss', did);
                if (rssDef.success === false) return rssDef;
                break;
            case 'sitemap':
                const sitemapConfig: Static<typeof Sitemap> = {
                    ...configBase,
                    url: configParams.url,
                    since: '1d'
                }

                // store crawl config
                const sitemapResp = writeSitemapCrawl(sitemapConfig);
                if (sitemapResp.success === false) return sitemapResp;

                // add crawl to defaults
                const sitemapDef = setDefaultCrawl('sitemap', did);
                if (sitemapDef.success === false) return sitemapDef;
                break;
            case 'twitter':
                // if token is included, save it as an env var
                if (typeof configParams.token === 'string') {
                    setVars(`TWITTER_TOKEN=${configParams.token}`, false);
                }

                const twitterConfig: Static<typeof Twitter> = {
                    ...configBase,
                    userId: 0,
                    username: configParams.username,
                    lastTweet: ''
                }

                // store crawl config
                const twitterResp = await writeTwitterCrawl(twitterConfig);
                if (twitterResp.success === false) return twitterResp;

                // add crawl to defaults
                const twitterDef = setDefaultCrawl('twitter', did);
                if (twitterDef.success === false) return twitterDef;
                break;
            case 'webhose':
                // if token is included, save it as an env var
                if (typeof configParams.token === 'string') {
                    setVars(`WEBHOSE_TOKEN=${configParams.token}`, false);
                }

                const webhoseConfig: Static<typeof Webhose> = {
                    ...configBase,
                    url: configParams.url
                }

                // store crawl config
                const webhoseResp = writeWebhoseCrawl(webhoseConfig);
                if (webhoseResp.success === false) return webhoseResp;

                // add crawl to defaults
                const webhoseDef = setDefaultCrawl('webhose', did);
                if (webhoseDef.success === false) return webhoseDef;
                break;
            default:
                const msg = `Unsupported crawl config type ${type}`;
                return {
                    success: false,
                    message: msg
                }
        }
    }

    return {
        success: true,
        message: 'Successfully persisted crawl configs'
    }
}

export { promptIdentitySetup, persistIdentitySetup, promptProxySetup, persistProxySetup, promptNetworkSetup, persistNetworkSetup, promptCrawlSetup, persistCrawlSetup }
