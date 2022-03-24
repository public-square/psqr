// @ts-ignore: rmSync is available despite warnings
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';

import { createHash } from 'crypto';

import { Static } from 'runtypes';

import { generateKeyPair } from 'jose/util/generate_key_pair';
import { fromKeyLike } from 'jose/jwk/from_key_like';

import { getVars, setVars } from './env';
import { runtypeCheck, verifyKeyPairs } from './validate';
import { PublicKey, PrivateKey, Did, PublicInfo, Identity, KeyPair } from '../types/identity';
import { DataResponse } from '../types/interfaces';
import { createFiles, retrieveFiles, handleRuntypeFail, FileConfig, FileResponse, retrieveRegFiles } from '../functions/utility';
import { KID, Url } from '../types/base-types';

const bencode = require('bencode');

const axios = require('axios').default;
const homedir = require('os').homedir();

const IDENTITY_PATH = `${homedir}/.config/psqr/identities`;

type DidResponse = {
    success: true;
    didDoc: Static<typeof Did>;
} | {
    success: false;
    error: Error;
}

interface KeyFile {
    kid: Static<typeof KID>;
    relative: boolean;
    publicFile?: string;
    privateFile: string;
}

type KeyPairsResponse = {
    success: true;
    message: string;
    keyPairs: Static<typeof KeyPair>[];
} | {
    success: false;
    message: string;
}

interface PathResponse extends DataResponse {
    data: {
        bdid: string;
        kname: string;
        didPath: string;
        privPath: string;
        pubPath: string;
    };
}

export type IdentityResponse = {
    success: true;
    message: string;
    identity: Static<typeof Identity>;
} | {
    success: false;
    message: string;
}

/**
 * Validate a provided Identity.
 *
 * @param identity obj containing identity to use
 * @returns outcome of identity validation including valid identity obj
 */
async function validateIdentity(identity: Static<typeof Identity>): Promise<IdentityResponse> {
    try {
        // validate identity object
        Identity.check(identity);

        // get parts of identity
        const keys = identity.keyPairs;
        const didDoc = Did.check(identity.didDoc);

        // ensure we have some keys to work with at this point
        if (keys.length === 0) {
            return { success: false, message: 'No keys provided' }
        }

        let msg = '';

        // validate keys
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keyName = parseKidKey(key.kid);
            if (keyName === false) {
                msg += `Unable to retrieve key name from ${key.kid} so KeyPair has been removed\n`

                keys.splice(i, 1);
                continue;
            }

            // verify key runtype
            const priv = PrivateKey.check(key.private);
            const pub = PublicKey.check(key.public);

            // verify provided public key is in DID, if not remove it
            const didKeys: Static<typeof PublicKey>[] = didDoc.psqr.publicKeys;
            const didCopy = didKeys.filter(k => k.kid === pub.kid && k.x === pub.x);
            if (didCopy.length === 0) {
                msg += `KeyPair ${keyName} is not present in didDoc and has been removed\n`

                keys.splice(i, 1);
                continue;
            }

            // verify the public key and private keys match
            if (await verifyKeyPairs(pub, priv) === false) {
                msg += `KeyPair ${keyName} is invalid and has been removed\n`

                const filteredKeys = didKeys.filter(k => k.kid !== pub.kid && k.x !== pub.x);
                didDoc.psqr.publicKeys = filteredKeys;

                keys.splice(i, 1);
                continue;
            }
        }

        // override old values with validated ones
        identity.keyPairs = keys;
        identity.didDoc = didDoc;

        if (keys.length === 0) {
            return {
                success: false,
                message: 'No valid keys provided',
            }
        }

        if (msg === '') {
            msg = 'Provided identity is completely valid';
        } else {
            msg = 'Provided identity is partially valid\n' + msg;
        }

        return { success: true, message: msg, identity }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Create a completely new Identity.
 * If key names aren't specified this will attempt to get the key name
 * from the kid and fall back on the name 'publish'.
 *
 * @param kid did with trailing key name
 * @param info public info obj to be included in DID
 * @param keyNames list of names of keys to be included
 * @returns outcome of attempt including full identity
 */
async function createIdentity(kid: string, info: Static<typeof PublicInfo>, keyNames: string[] = []): Promise<IdentityResponse> {
    const did = parseBareDid(kid);
    if (did === false) return { success: false, message: 'Unable to parse kid, expected format did:psqr:{hostname}/{path}#{keyId}' };

    // if no names specified, get name from kid or use default
    if (keyNames.length === 0) {
        keyNames = [parseKidKey(kid) || 'publish']
    }

    try {
        // create keys
        const keyPairs = await generateKeys(kid, keyNames);
        if (keyPairs === false) return { success: false, message: 'Unable to generate keys' };

        // validate public info
        PublicInfo.check(info);

        // create DID using new keys, kid, and public info
        const didResp = generateDID(did, keyPairs, info);
        if (didResp.success === false) return { success: false, message: handleRuntypeFail(didResp.error) };

        // assemble new identity
        const identity = Identity.check({
            did,
            keyPairs,
            didDoc: didResp.didDoc,
        })

        // return new identity
        const response: IdentityResponse = {
            success: true,
            message: `Created identity for DID ${did} successfully`,
            identity,
        };

        return response;
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Save an identity to psqr config dir to use.
 *
 * @param identity obj containing identity to add
 * @returns outcome of attempt
 */
async function addIdentity(identity: Static<typeof Identity>): Promise<DataResponse> {
    // add a key if there are no provided keys
    if (identity.keyPairs.length === 0) return { success: false, message: 'No keys provided' }

    // validate identity
    const valid = await validateIdentity(identity);
    if (valid.success === false) return valid;

    // extract elements of identity
    const { keyPairs, did, didDoc } = valid.identity;
    const keys = keyPairs;

    // set where identity should go
    const didPath = `${IDENTITY_PATH}/${did.replace(/:/g, '-')}/`;
    const docPath = didPath + 'identity.json';

    try {
        // ensure did dir exists
        if (existsSync(didPath) === false) mkdirSync(didPath, { recursive: true });

        // create list of files to be created
        const files: FileConfig[] = [
            {
                path: docPath,
                relative: false,
                data: didDoc,
            },
        ]

        // iterate through and add keys
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const keyName = parseKidKey(key.kid);
            if (keyName === false) continue;

            files.push(
                {
                    path: `${didPath + keyName}.public.jwk`,
                    relative: false,
                    data: key.public,
                },
                {
                    path: `${didPath + keyName}.private.jwk`,
                    relative: false,
                    data: key.private,
                }
            );
        }

        // create the identity files and return outcome
        const nf = await createFiles(files);
        if (nf.success === false) return { success: false, message: 'Unable to save keys: ' + nf.message }

        return { success: true, message: `Successfully added ${did} as an identity` }
    } catch (error) {
        return { success: false, message: error.message }
    }
}

/**
 * Get the current default id strings from the ENV
 *
 * @returns outcome including bdid, kname, and kid
 */
function getDefaultIds(): DataResponse {
    const defVars = getVars(['DEFAULT_DID', 'DEFAULT_KEY']);
    if (
        defVars.DEFAULT_DID === null || defVars.DEFAULT_DID === '' ||
        defVars.DEFAULT_KEY === null || defVars.DEFAULT_KEY === ''
    ) {
        return {
            success: false,
            message: `No KID provided and insufficient defaults: ${JSON.stringify(defVars)}`,
        };
    }

    // set did and key
    const bdid = defVars.DEFAULT_DID;
    const kname = defVars.DEFAULT_KEY;

    const kid = bdid + '#' + kname;

    return {
        success: true,
        message: 'Successfully retrieved default kid',
        data: {
            bdid,
            kname,
            kid,
        },
    }
}

/**
 * Get identity stored locally.
 * If no kid is specified the default identity will be
 * retrieved and returned.
 * Exclude trailing #keyName for no keys.
 *
 * @param kid did with trailing key name
 * @returns outcome of request including identity object
 */
async function getIdentity(kid = ''): Promise<IdentityResponse> {
    const didErr: IdentityResponse = {
        success: false,
        message: 'Expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
    }

    let bdid;

    // if kid is empty get default identity
    if (kid === '') {
        const defResp = getDefaultIds();
        if (defResp.success === false) return { success: false, message: 'Unable to get default identity because: ' + defResp.message };

        // set did and key
        bdid = defResp.data.bdid;
        kid = defResp.data.kid;
    } else {
        // get and set bdid
        const bResp = parseBareDid(kid);
        if (bResp === false) return didErr;

        bdid = bResp;
    }

    // retrieve DID and keys requested
    try {
        // get full DID
        const dresp = await getDid(bdid);
        if (dresp.success === false) {
            didErr.message = 'Unable to get did doc because: ' + dresp.error.message
            return didErr;
        }
        const didDoc = Did.check(dresp.didDoc);

        // get requested keys
        let keyPairs: Static<typeof KeyPair>[] = [];
        // verify there were keys requested
        const keyName = parseKidKey(kid);
        if (keyName !== false) {
            const kresp = await getKeyPair(kid);
            if (kresp.success === false) return kresp;
            keyPairs.push(kresp.keyPairs[0]);
        }

        // get all components of identity being used and assemble Identity obj
        const identity = Identity.check({
            did: bdid,
            didDoc: didDoc,
            keyPairs: keyPairs,
        });

        return {
            success: true,
            message: `Successfully retrieved identity for ${kid}`,
            identity,
        }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Get full identity stored locally, including all associated keys
 * If no kid is specified the default identity will be
 * retrieved and returned.
 *
 * @param did string identifying a DID
 * @returns outcome of request including identity object
 */
async function getFullIdentity(did = ''): Promise<IdentityResponse> {
    const didErr: IdentityResponse = {
        success: false,
        message: 'Expected format: did:(psqr|web):{hostname}(/|:){path}',
    }
    let bdid;

    // if kid is empty get default identity
    if (did === '') {
        const defVars = getVars(['DEFAULT_DID']);
        const ddid = defVars.DEFAULT_DID;
        if (typeof ddid === 'undefined' || ddid === '') {
            didErr.message = `No DID provided and insufficient defaults: ${JSON.stringify(defVars)}`
            return didErr;
        }

        // set did and key
        bdid = ddid;
    } else {
        // get and set did
        bdid = parseBareDid(did);
        if (bdid === false) {
            didErr.message = 'Invalid Did url string. ' + didErr.message;
            return didErr;
        }
    }

    // retrieve DID and keys
    try {
        // get full DID
        const dresp = await getDid(bdid);
        if (dresp.success === false) {
            didErr.message = dresp.error.message
            return didErr;
        }
        const didDoc = Did.check(dresp.didDoc);

        // get all keys
        const kresp = await getAllKeyPairs(bdid);
        if (kresp.success === false) return kresp;
        const keyPairs = kresp.keyPairs;

        // get all components of identity being used and assemble Identity obj
        const identity = Identity.check({
            did,
            didDoc,
            keyPairs,
        });

        return {
            success: true,
            message: `Successfully retrieved identity and all keys for ${did}`,
            identity,
        }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Check for identity and then set as default in ENV
 *
 * @param kid did with trailing key name
 * @returns outcome of attempt to set default
 */
function setDefaultIdentity(kid: string): DataResponse {
    // get paths, this also checks to be sure they exist
    const paths = parseIdentityPaths(kid);
    if (paths.success === false) return paths;

    // set the default vars
    setVars(`DEFAULT_DID=${paths.data.bdid},DEFAULT_KEY=${paths.data.kname}`, false);

    return {
        success: true,
        message: `Successfully set ${kid} as the default identity`,
    }
}

/**
 * If DID is already present locally, get and return that.
 * If not get DID from url in did string, save locally,
 * and return it.
 *
 * @param did string identifying a DID
 * @returns outcome of request including full DID
 */
async function getDid(did: string): Promise<DidResponse> {
    const didErr: DidResponse = {
        success: false,
        error: new TypeError('Unable to parse did string. Expected format: did:(psqr|web):{hostname}(/|:){path}'),
    }

    // ensure it is only the did string, no key names
    const bdid = parseBareDid(did);
    if (bdid === false) return didErr;
    const didType = parseDidType(bdid);

    // set expected local did path
    const didPath = `${IDENTITY_PATH}/${bdid.replace(/:/g, '-')}/identity.json`;
    try {
        // if DID doesn't exist locally, get from url
        if (existsSync(didPath) === false) {
            // make identity dir
            const dir = didPath.replace('/identity.json', '');
            if (existsSync(dir) === false) mkdirSync(dir, { recursive: true });

            // get url for DID
            const url = parseDidUrl(bdid);
            if (url === false) return didErr;

            // retrieve DID based on type
            let didDoc
            if (didType === 'web') {
                // retrieve and validate DID from url
                const response = await axios.get(url);
                didDoc = Did.check(response.data);
            } else {
                // set required accept headers
                const config = {
                    headers: {
                        'accept': 'application/json,application/did+json'
                    }
                }

                // retrieve and validate DID from url
                const response = await axios.get(url, config);
                didDoc = Did.check(response.data);
            }

            // create DID local file and return DID
            writeFileSync(didPath, JSON.stringify(didDoc));

            return { success: true, didDoc }
        }

        // get DID from local file, validate, and return
        const fileData = JSON.parse(readFileSync(didPath, 'utf-8'));
        const didDoc = Did.check(fileData);

        return { success: true, didDoc }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, error: new TypeError(msg) }
    }
}

/**
 * Retrieve DID from url regardless of its presence locally
 * and save it locally.
 *
 * @param did string identifying a DID
 * @returns outcome of request including a full DID
 */
async function refreshDid(did: string): Promise<DidResponse> {
    const didErr: DidResponse = {
        success: false,
        error: new TypeError('Unable to parse did string. Expected format: did:(psqr|web):{hostname}(/|:){path}'),
    }

    // ensure it is only the did string, no key names
    const bdid = parseBareDid(did);
    if (bdid === false) return didErr;

    // set expected local did path
    const didPath = `${IDENTITY_PATH}/${bdid.replace(/:/g, '-')}/identity.json`;
    try {
        // remove DID file if it exists
        if (existsSync(didPath)) {
            rmSync(didPath, { recursive: true })
        }

        // use getDid function to download latest DID
        const resp = await getDid(did)

        return resp;
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, error: new TypeError(msg) }
    }
}

/**
 * Retrieve a pair of keys stored locally.
 * Keys are returned in the JWK format.
 *
 * @param kid did with trailing key name
 * @returns outcome of request including pair of keys requested as JWKs
 */
async function getKeyPair(kid: string): Promise<KeyPairsResponse> {
    // get expected path to identity
    const paths = parseIdentityPaths(kid);
    if (paths.success === false) return { success: false, message: paths.message };

    // retrieve key files
    const priv = readFileSync(paths.data.privPath).toString();
    const pub = readFileSync(paths.data.pubPath).toString();

    let privKey;
    let pubKey;

    try {
        // parse file contents and validate JWK
        privKey = PrivateKey.check(JSON.parse(priv));
        pubKey = PublicKey.check(JSON.parse(pub));
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // verify that they are a pair
    const vkResp = await verifyKeyPairs(pubKey, privKey);
    if (vkResp === false) return { success: false, message: 'Keys found but were not valid pairs' }

    // return keys as JWK
    return {
        success: true,
        message: `Successfully got Key Pair from kid ${kid}`,
        keyPairs: [{
            kid,
            private: privKey,
            public: pubKey,
        }],
    }
}

/**
 * Retrieve all key pairs stored locally with an identity.
 * Keys are returned in the JWK format.
 *
 * @param did string identifying a DID
 * @returns false or array of key Pairs
 */
async function getAllKeyPairs(did: string): Promise<KeyPairsResponse> {
    // ensure it is only the did string, no key names
    const bdid = parseBareDid(did);
    if (bdid === false) return { success: false, message: 'Invalid Did url string' };

    // assemble expected key root dir, regex, and file config
    const reg = /.+\.jwk$/m
    const dir = `${IDENTITY_PATH}/${bdid.replace(/:/g, '-')}/`;
    const fc: FileConfig = {
        path: dir,
        relative: false,
    }

    // retrieve all key files
    const resp = await retrieveRegFiles(reg, fc)
    if (resp.success === false) return { success: false, message: resp.message };

    // parse list of keys
    const keys: Array<
        Static<typeof PublicKey> |
        Static<typeof PrivateKey>
    > = resp.files.map(f => {
        if (typeof f === 'object' && typeof f.data === 'string') {
            return JSON.parse(f.data)
        }
    });

    // pair public and private keys
    const paired: string[] = [];
    const keyPairs: Static<typeof KeyPair>[] = [];
    for (let i = 0; i < keys.length; i++) {
        // parse JWK obj from file data
        const key = keys[i];

        // skip already paired keys
        if (paired.includes(key.kid)) continue;

        // find pair and ensure it's only 2
        const matches = keys.filter(k => k.kid === key.kid);
        if (matches.length !== 2) continue;

        let privKey;
        let pubKey;
        let pair;

        try {
            // if first key is private, assume second is public
            const test = runtypeCheck(matches[0], PrivateKey);

            // validate keys
            privKey = PrivateKey.check(matches[test ? 0 : 1]);
            pubKey = PublicKey.check(matches[test ? 1 : 0]);

            // verify that they are a pair
            const vkResp = await verifyKeyPairs(pubKey, privKey);
            if (vkResp === false) continue

            // make KeyPair object
            pair = KeyPair.check({
                kid: key.kid,
                private: privKey,
                public: pubKey,
            })
        } catch (error) {
            continue
        }

        // add pair to keyPairs and kid to paired array
        paired.push(key.kid);
        keyPairs.push(pair);
    }

    // ensure there are some pairs to return
    if (keyPairs.length === 0) return { success: false, message: `No pairs found for did ${bdid}` };

    // return key pairs
    return {
        success: true,
        message: `Successfully got all Key pairs for did ${bdid}`,
        keyPairs,
    }
}

/**
 * Create and add a new KeyPair to a provided identity.
 * If keyName isn't specified a name will be parsed from the kid,
 * and finally fallback to 'publish'.
 * This does NOT save the new identity anywhere.
 *
 * @param identity obj containing identity to use
 * @param kid did with trailing key name
 * @param keyName name of key to be added to DID
 * @returns outcome of attempt including new identity object
 */
async function addNewKeyPair(identity: Static<typeof Identity>, kid: string, keyName = ''): Promise<IdentityResponse> {
    // get key name from kid if empty or fallback to publish
    if (keyName === '') {
        keyName = parseKidKey(kid) || 'publish';
    }

    // generate new keys based on key name
    const keyPair = await generateKeys(kid, [keyName]);
    if (keyPair === false) return { success: false, message: 'Unable to generate keys' };
    const keys = keyPair[0];

    try {
        // validate identity and keys
        Identity.check(identity);
        KeyPair.check(keys);

        // add generated keys using addExistingKeyPair
        const addResp = await addExistingKeyPair(identity, keys);
        if (addResp.success === false) {
            addResp.message = 'Unable to add created keys to identity because: ' + addResp.message;
            return addResp;
        }

        return { success: true, message: `Added new keys name ${keyName} to identity.`, identity: addResp.identity }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Add a pre-existing KeyPair to a provided identity.
 * This does NOT save the new identity anywhere.
 *
 * @param identity obj containing identity to use
 * @param keyPair KeyPair object containing keys to add
 * @param allowDuplicate don't fail if provided KeyPair is already present in DID
 * @returns outcome of attempt including new identity object
 */
async function addExistingKeyPair(identity: Static<typeof Identity>, keyPair: Static<typeof KeyPair>, allowDuplicate = false): Promise<IdentityResponse> {
    try {
        // validate identity and get didDoc
        Identity.check(identity);
        const didDoc = Did.check(identity.didDoc);

        // validate keys
        KeyPair.check(keyPair);
        const keyName = parseKidKey(keyPair.kid);

        // ensure both keys are present
        if (typeof keyPair.private === 'undefined' ||
            typeof keyPair.public === 'undefined') {
            return { success: false, message: 'Provided keys are not complete' }
        }

        // check to be sure new public key doesn't already exist in didDoc
        const didKeys = didDoc.psqr.publicKeys;
        const didCopy = didKeys.filter(k => k.kid === keyPair.kid || k.x === keyPair.public?.x);
        if (didCopy.length > 0) {
            if (allowDuplicate === false) {
                return {
                    success: false,
                    message: `A KeyPair named ${keyName} is already present in the DID`,
                }
            }
        } else {
            // determine grant
            const grant = [];
            switch (keyName) {
                case 'admin':
                    grant.push('admin');
                    break;
                case 'publish':
                    grant.push('publish');
                    grant.push('provenance');
                    break;
                case 'curate':
                    grant.push('curate');
                    grant.push('provenance');
                    break;
                case 'authenticate':
                    grant.push('authenticate');
                    grant.push('provenance');
                    break;
                default:
                    grant.push('provenance');
                    break;
            }

            // add public key to DID
            didDoc.psqr.publicKeys.push(keyPair.public);
            didDoc.psqr.permissions.push({
                grant: grant,
                kid: keyPair.kid,
            })
        }

        // ensure no duplicates
        const newKeyPairs = identity.keyPairs;
        const oldKeyCopy = newKeyPairs.filter(k => k.kid === keyPair.kid || k.public?.x === keyPair.public?.x);
        if (oldKeyCopy.length > 0) {
            if (allowDuplicate === false) {
                return {
                    success: false,
                    message: `A KeyPair named ${keyName} is already present in the DID`,
                }
            }
        } else {
            newKeyPairs.push(keyPair);
        }

        // add public key to DID and create new updated identity
        const newId = Identity.check({
            did: identity.did,
            didDoc,
            keyPairs: newKeyPairs,
        })

        return { success: true, message: `Added existing keys named ${keyName} to identity.`, identity: newId }
    } catch (error) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Retrieve and arbitrary amount of keys.
 * This requires you to know and specify the exact paths they
 * are located at.
 *
 * @param keyFiles array of paths to local key pairs
 * @returns array of key pairs or false on error
 */
async function retrieveKeys(keyFiles: KeyFile[]): Promise<Static<typeof KeyPair>[] | false> {
    const pairs: Static<typeof KeyPair>[] = [];
    for (let i = 0; i < keyFiles.length; i++) {
        const key = keyFiles[i];

        // private key must always be present
        const files: FileConfig[] = [{
            path: key.privateFile,
            relative: key.relative,
        }];

        // if public key is present, add to FileConfig
        if (typeof key.publicFile !== 'undefined') {
            files.push({
                path: key.publicFile,
                relative: key.relative,
            });
        }

        // retrieve files
        const resp: FileResponse = await retrieveFiles(files);
        if (resp.success === false) return false;

        // extract private file first since we know it will exist
        let privateFile: FileConfig | boolean = false;
        for (let j = 0; j < resp.files.length; j++) {
            const f = resp.files[j];

            // validate file object and add if it is the private key
            if (typeof f === 'object' && f.path.includes(key.privateFile)) {
                privateFile = f;
                break;
            }
        }
        if (privateFile === false || typeof privateFile.data !== 'string') return false;

        try {
            // start assembly of key pair and validate private JWK
            const pair: Static<typeof KeyPair> = {
                kid: key.kid,
                private: PrivateKey.check(JSON.parse(privateFile.data)),
            }

            // validate and add public key if present
            if (typeof key.publicFile !== 'undefined') {
                for (let k = 0; k < resp.files.length; k++) {
                    const f = resp.files[k];

                    // validate file object and add if it is the public key
                    if (
                        typeof f === 'object' &&
                        typeof f.data === 'string' &&
                        f.path.includes(key.publicFile)
                    ) {
                        pair.public = PublicKey.check(JSON.parse(f.data));
                        break;
                    }
                }

                // if public key wasn't found, parse it from the private key file
                if (typeof pair.public === 'undefined') {
                    let tempKey = JSON.parse(privateFile.data);
                    delete tempKey.d;

                    pair.public = PublicKey.check(tempKey);
                }
            }

            pairs.push(pair);
        } catch (error) {
            const msg = handleRuntypeFail(error);
            console.log(msg)
            return false;
        }
    }

    return pairs;
}

/**
 * Create an arbitrary amount of key pairs for a DID.
 * NOTE: this will not add the public keys to the appropriate
 * section of the DID.
 *
 * @param did string identifying a DID
 * @param names array of names of keys to create
 * @returns array of key pairs or false on error
 */
async function generateKeys(did: string, names: string[]): Promise<Static<typeof KeyPair>[] | false> {
    const alg = 'ES384';

    // ensure did doesn't have key name
    const bdid = parseBareDid(did);
    if (bdid === false) return false;

    // iterate through requested key names
    const keyPairs: Static<typeof KeyPair>[] = [];
    for (let i = 0; i < names.length; i++) {
        const { publicKey, privateKey } = await generateKeyPair(alg, {
            extractable: true,
        });

        // get JWK representation of keys
        const publicJWK = await fromKeyLike(publicKey);
        const privateJWK = await fromKeyLike(privateKey);

        // add alg since it is required
        publicJWK.alg = alg;
        privateJWK.alg = alg;

        // add kid
        const kid = bdid + '#' + names[i]
        publicJWK.kid = kid;
        privateJWK.kid = kid;

        try {
            keyPairs.push({
                kid,
                public: PublicKey.check(publicJWK),
                private: PrivateKey.check(privateJWK),
            })
        } catch (error) {
            const msg = handleRuntypeFail(error);
            console.log(msg)
            return false;
        }
    }

    return keyPairs;
}

/**
 * Create a DIDPSQR doc using specified did string,
 * key pairs, and public info.
 *
 * @param did string identifying a DID
 * @param keyPairs key pairs to be included in DID
 * @param info public info obj to be included in DID
 * @returns outcome of request including full DID that was generated
 */
function generateDID(did: string, keyPairs: Static<typeof KeyPair>[], info: Static<typeof PublicInfo>): DidResponse {
    try {
        // validate public info
        PublicInfo.check(info);

        // create DID without keys
        const didDoc: Static<typeof Did> = {
            '@context': [
                'https://www.w3.org/ns/did/v1',
                'https://vpsqr.com/ns/did-psqr/v1'
            ],
            id: did,
            psqr: {
                publicIdentity: info,
                publicKeys: [],
                permissions: [],
                updated: Date.now()
            }
        };

        // iterate through each key pair and add public key
        for (let i = 0; i < keyPairs.length; i++) {
            // get and validate public key
            const pair = keyPairs[i];
            const name = parseKidKey(pair.kid);
            const pub = PublicKey.check(pair.public);

            // determine grant
            const grant = [];
            switch (name) {
                case 'admin':
                    grant.push('admin');
                    break;
                case 'publish':
                    grant.push('publish');
                    grant.push('provenance');
                    break;
                case 'curate':
                    grant.push('curate');
                    grant.push('provenance');
                    break;
                case 'authenticate':
                    grant.push('authenticate');
                    grant.push('provenance');
                    break;
                default:
                    grant.push('provenance');
                    break;
            }

            // add public key to DID
            didDoc.psqr.publicKeys.push(pub);
            didDoc.psqr.permissions.push({
                grant: grant,
                kid: pair.kid,
            })
        }

        // validate and return didDoc
        Did.check(didDoc)

        return {
            success: true,
            didDoc,
        }
    } catch (error) {
        return { success: false, error }
    }
}

/**
 * Generate the infoHash of an object.
 *
 * @param info obj to get hash of
 * @returns bencoded infoHash string
 */
function generateInfoHash(info: object): string {
    const binfo = bencode.encode(info);
    const hash = createHash('sha1').update(binfo).digest('hex');

    return hash;
}

/**
 * Parse and return bare did and key name from kid.
 *
 * @param kid did with trailing key name
 * @returns bare did and key name or false on error
 */
function parseKid(kid: string): { bdid: string; kname: string } | false {
    const bdid = parseBareDid(kid);
    if (bdid === false) return false;

    const kname = parseKidKey(kid);
    if (kname === false) return false;

    return { bdid, kname }
}

/**
 * Get the paths to the DID and keys associated with a kid.
 *
 * @param kid did with trailing key name
 * @returns outcome of request including list of paths
 */
function parseIdentityPaths(kid: string): PathResponse {
    // return empty on failure
    const didErr: PathResponse = {
        success: false,
        message: 'Unable to parse kid string. Expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        data: {
            bdid: '',
            kname: '',
            didPath: '',
            privPath: '',
            pubPath: '',
        },
    }
    const pkid = parseKid(kid);
    if (pkid === false) return didErr;

    // extract bare did and key name
    const { bdid, kname } = pkid;

    // assemble expected DID and key paths
    const idPath = `${IDENTITY_PATH}/${bdid.replace(/:/g, '-')}/`;
    const didPath = idPath + 'identity.json';
    const privPath = idPath + kname + '.private.jwk';
    const pubPath = idPath + kname + '.public.jwk';

    // ensure paths point to real files
    if (existsSync(didPath) === false) {
        didErr.message = `The DID doc for identity ${kid} doesn't exist at ${didPath}`;
        return didErr;
    }

    if (existsSync(privPath) === false) {
        didErr.message = `The Private Key for identity ${kid} doesn't exist at ${privPath}`;
        return didErr;
    }

    if (existsSync(pubPath) === false) {
        didErr.message = `The Public Key for identity ${kid} doesn't exist at ${pubPath}`;
        return didErr;
    }

    return {
        success: true,
        message: 'Parsed paths successfully',
        data: {
            bdid,
            kname,
            didPath,
            privPath,
            pubPath,
        },
    }
}

/**
 * Remove any key names and return the bare did string.
 *
 * @param kid did with trailing key name
 * @returns bare did or false on error
 */
function parseBareDid(kid: string): string | false {
    // strip # and anything after
    try {
        const bdid = kid.match(/[^#]+/g);
        if (bdid === null || bdid[0] === null) return false;

        const did = bdid[0];
        if (typeof did === 'undefined') return false;

        return did
    } catch (error) {
        return false;
    }
}

/**
 * Extract key name from kid.
 *
 * @param kid did with trailing key name
 * @returns key name or false on error
 */
function parseKidKey(kid: string): string | false {
    try {
        const parts = kid.match(/[^#]+/g);
        if (parts === null || parts[1] === null) return false;

        // return key name after #
        const name = parts[1];
        if (typeof name === 'undefined') return false

        return name
    } catch (error) {
        return false;
    }
}

/**
 * Assemble http url where a DID can be found based
 * on provided did string.
 *
 * @param did string identifying a DID
 * @returns url where DID is located or false on error
 */
function parseDidUrl(did: string): Static<typeof Url> | false {
    // remove any key names
    const bdid = parseBareDid(did);
    if (bdid === false) return false;

    // determine didType
    const didType = parseDidType(bdid);

    try {
        // separate components
        const matches = bdid.split(':');

        // ensure all components are present
        if (matches.length < 3) {
            return false;
        }

        // remove initial part of did and delimit with /
        let path = matches.slice(2).join('/');

        // add to path if necessary
        if (path.includes('/') === false) {
            path += didType === 'psqr' ? '/.well-known/psqr' : '/.well-known';
        }
        if (matches[1] === 'web') {
            // add did.json if web
            path += `/did.json`;
        }

        const url = Url.check(`https://${path}`);

        return url;
    } catch (error) {
        return false;
    }
}

/**
 * Determines what kind of DID a DID string refers to.
 *
 * @param did string identifying a DID
 * @returns identified type as string
 */
function parseDidType(did: string): string | false {
    // remove any key names
    const bdid = parseBareDid(did);
    if (bdid === false) return false;

    try {
        const didReg = /did:(\w+)/
        const result = didReg.exec(bdid)
        if (result === null) return false;

        return result[1];
    } catch (error) {
        return false;
    }
}

/**
 * Verify if the DID specified has an admin key associated with it.
 * Fail if no identity.json file is found or if no admin privileges are returned
 *
 * @param did did string
 * @returns identity object or error message
 */
async function verifyAdminIdentity(did: string): Promise<IdentityResponse> {
    // get local identity.json based off of did
    const dResp = await getDid(did);

    if (dResp.success === false) {
        return { success: false, message: 'Could not locate DID JSON File for: ' + did };
    }

    // verify if admin privileges exist
    const rules = dResp.didDoc.psqr.permissions;
    let adminId: string | false = false;

    // fetch admin from did Response
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];

        if (rule.grant.includes('admin')) {
            adminId = rule.kid;
        }
    }

    if (adminId === false) {
        return { success: false, message: 'Could not locate Admin Privileges for: ' + did };
    }

    // get DID doc and admin key
    const idResp = await getIdentity(adminId);

    return idResp;
}

export {
    getDid, getKeyPair, addNewKeyPair, addExistingKeyPair, retrieveKeys, generateKeys,
    validateIdentity, addIdentity, createIdentity, getIdentity, getDefaultIds, setDefaultIdentity, getFullIdentity,
    refreshDid, generateInfoHash, parseDidUrl, parseBareDid, parseKidKey, parseDidType, verifyAdminIdentity,
};
