import { CompactSign, compactVerify, importJWK } from 'jose';
import { Runtype, Static } from 'runtypes';

import { PublicKey, PrivateKey } from '../types/identity';
import { handleRuntypeFail } from './utility';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Check whether a pair of keys constitute
 * a valid pair and if they can sign content
 *
 * @param pubKeyObj Public Key represented as a JWK object
 * @param privKeyObj Private Key represented as a JWK object
 * @returns boolean based on pairing
 */
async function verifyKeyPairs(pubKeyObj: Static<typeof PublicKey>, privKeyObj: Static<typeof PrivateKey>): Promise<boolean> {
    // type check on params
    try {
        PublicKey.check(pubKeyObj);
        PrivateKey.check(privKeyObj);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        console.log(msg);
        return false;
    }

    // get keys from JWK objects
    const pubKey = await importJWK(pubKeyObj);
    const privKey = await importJWK(privKeyObj);

    const content = 'Test text string';
    const header = { alg: 'ES384' };

    // sign string and then decrypt it to verify keys are a valid pair
    const jws = await new CompactSign(encoder.encode(content)).setProtectedHeader(header).sign(privKey);
    try {
        const { payload } = await compactVerify(jws, pubKey);

        if (decoder.decode(payload) !== content) {
            return false;
        }

        return true;
    } catch (error: any) {
        return false;
    }
}

/**
 * Validates the checking of runtypes.
 *
 * @param subject variable to check
 * @param type runtype to validate against
 * @returns boolean based on match
 */
function runtypeCheck(subject: any, type: Runtype): boolean {
    try {
        type.check(subject);

        return true;
    } catch (error: any) {
        return false
    }
}

export { verifyKeyPairs, runtypeCheck }
