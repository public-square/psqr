import {CompactSign} from 'jose/jws/compact/sign';
import {compactVerify} from 'jose/jws/compact/verify';
import {parseJwk} from 'jose/jwk/parse';

import {Runtype, Static} from 'runtypes';

import {PublicKey, PrivateKey} from '../types/identity';
import {handleRuntypeFail} from './utility';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Check whether 2 keys passed are a valid pair
 * and can they sign content
 *
 * @param pubKeyObj Public Key represented as a JWK object
 * @param privKeyObj Private Key represented as a JWK object
 * @returns boolean are the 2 keys passed a pair
 */
async function verifyKeyPairs(pubKeyObj: Static<typeof PublicKey>, privKeyObj: Static<typeof PrivateKey>): Promise<boolean> {
    // type check on params
    try {
        PublicKey.check(pubKeyObj);
        PrivateKey.check(privKeyObj);
    } catch (error) {
        const msg = handleRuntypeFail(error);
        console.log(msg);
        return false;
    }

    // get keys from JWK objects
    const pubKey = await parseJwk(pubKeyObj);
    const privKey = await parseJwk(privKeyObj);

    const content = 'Test text string';
    const header = {alg: 'ES384'};

    // sign string and then decrypt it to verify keys are a valid pair
    const jws = await new CompactSign(encoder.encode(content)).setProtectedHeader(header).sign(privKey);
    try {
        const {payload} = await compactVerify(jws, pubKey);

        if (decoder.decode(payload) !== content) {
            return false;
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Return a boolean for a runtype check instead
 * of throwing an error.
 *
 * @param subject variable to check
 * @param type runtype to validate against
 * @returns does the subject match the type
 */
function runtypeCheck(subject: any, type: Runtype): boolean {
    try {
        type.check(subject);

        return true;
    } catch (error) {
        return false
    }
}

export {verifyKeyPairs, runtypeCheck}
