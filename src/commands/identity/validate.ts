import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { addExistingKeyPair, getDid, parseBareDid, parseKidKey, validateIdentity } from '../../functions/identity';
import { handleRuntypeFail, FileConfig, retrieveFiles } from '../../functions/utility';
import { KeyPair, Identity } from '../../types/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class IdentityValidate extends Command {
    static description = 'Validate an identity (DID doc and key pair)'

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as key instead of key PATH' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'Key PATH specified is raw (not a filepath), you need to escape "' }),
        absolute: flags.boolean({ char: 'a', default: false, description: 'Key PATH is an absolute path' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        },
        {
            name: 'path',
            description: 'Path to directory containing keys in the form of a JWK, expected algorithm: ES384. Expected files are private.jwk and public.jwk',
        },
    ]

    async run() {
        const { args, flags } = this.parse(IdentityValidate)

        const oraStart = ora('Preparing command...').start();

        if (args.kid === null || (args.path === null && flags.stdin !== true)) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:validate', '-h']);
        }

        const kid = args.kid;
        const path = args.path;

        oraStart.succeed('Command ready')
        const oraRun = ora('Validating Identity...').start();

        // separate bare did and key name
        const bdid = parseBareDid(kid);
        if (bdid === false) return oraRun.fail('Unable to parse bare did from kid ' + kid);
        const keyName = parseKidKey(kid);
        if (keyName === false) return oraRun.fail('Unable to parse key name from kid ' + kid);

        // get identity object
        const dResp = await getDid(bdid);
        if (dResp.success === false) {
            const msg = handleRuntypeFail(dResp.error);
            return oraRun.fail(msg);
        }
        const didDoc = dResp.didDoc;

        // start identity
        let identity: Static<typeof Identity> = {
            did: bdid,
            didDoc,
            keyPairs: [],
        }

        // get key pair
        let keyPair: Static<typeof KeyPair>;
        switch (true) {
            case flags.stdin: {
                // get stdin
                const kIn = await getStdin();
                if (kIn === null || kIn === '') return oraRun.fail('Invalid stdin');

                // assemble and validate new key pair
                try {
                    keyPair = KeyPair.check(JSON.parse(kIn))
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return oraRun.fail(msg)
                }
                break;
            }
            case flags.raw: {
                // assemble and validate key pair from raw
                try {
                    keyPair = KeyPair.check(JSON.parse(path))
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return oraRun.fail(msg)
                }
                break;
            }
            default: {
                // generate config for both keys
                const privPath = path + '/private.jwk';
                const pubPath = path + '/public.jwk';
                const kf: FileConfig[] = [
                    {
                        path: privPath,
                        relative: flags.absolute === false,
                    },
                    {
                        path: pubPath,
                        relative: flags.absolute === false,
                    },
                ]
                const kfResp = await retrieveFiles(kf);
                if (kfResp.success === false) return oraRun.fail('Unable to find keys at ' + path)

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
                    return oraRun.fail('Unable to find keys at ' + path)
                }

                // assemble and validate new key pair
                try {
                    keyPair = KeyPair.check({
                        kid,
                        private: JSON.parse(privKey),
                        public: JSON.parse(pubKey),
                    })
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return oraRun.fail(msg)
                }
                break;
            }
        }

        // add existing key pair to current identity
        const ekResp = await addExistingKeyPair(identity, keyPair, true);
        if (ekResp.success === false) return oraRun.fail(ekResp.message);
        identity = ekResp.identity;

        // validate identity
        const resp = await validateIdentity(identity);

        if (resp.success) {
            oraRun.succeed(resp.message)
        } else {
            oraRun.fail(resp.message);
        }

        return resp.success;
    }
}
