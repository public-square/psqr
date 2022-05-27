import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { addExistingKeyPair, addIdentity, addNewKeyPair, getDid, parseBareDid, parseKidKey } from '../../functions/identity';
import { FileConfig, handleRuntypeFail, retrieveFiles } from '../../functions/utility';
import { Identity, KeyPair } from '../../types/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Adds a preexisting identity to the CLI Configuration and creates a new Key.
 */
export default class IdentityAdd extends Command {
    static description = `Add a preexisting identity to the cli config and create a new key.
This assumes the DID is located at the url specified in the KID url string.
If you have some pre-existing keys that you want to add you can either specify the path to them with --path,
or pass the entire KeyPair as a JSON string with --stdin.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as KeyPair. Expected JSON string format: { kid, private, public }' }),
        path: flags.string({ char: 'p', description: 'Instead of generating a new key, use the keys from this directory. Expected files are private.jwk and public.jwk' }),
        absolute: flags.boolean({ char: 'a', default: false, description: 'Key directory path is an absolute path' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(IdentityAdd)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.kid === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:add', '-h']);
        }

        const kid = args.kid;

        oraStart.succeed('Command ready')
        const oraRun = ora('Adding Identity...').start();

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

        switch (true) {
            case (flags.path !== undefined): {
                // generate config for both keys
                const privPath = flags.path + '/private.jwk';
                const pubPath = flags.path + '/public.jwk';
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
                if (kfResp.success === false) return oraRun.fail('Unable to find keys at ' + flags.path)

                // separate out key files
                let privKey;
                let pubKey;
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
                    return oraRun.fail('Unable to find keys at ' + flags.path)
                }

                // assemble and validate new key pair
                let fileKeyPair: Static<typeof KeyPair>;
                try {
                    fileKeyPair = KeyPair.check({
                        kid,
                        private: JSON.parse(privKey),
                        public: JSON.parse(pubKey),
                    })
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return oraRun.fail(msg)
                }

                // add existing key to current identity
                const fkResp = await addExistingKeyPair(identity, fileKeyPair, true);
                if (fkResp.success === false) return oraRun.fail(fkResp.message);

                identity = fkResp.identity;
                break;
            }
            case (flags.stdin === true): {
                // get stdin
                const kIn = await getStdin();
                if (kIn === null || kIn === '') return oraRun.fail('Invalid stdin');

                // assemble and validate new key pair
                let stdinKeyPair: Static<typeof KeyPair>;
                try {
                    stdinKeyPair = KeyPair.check(JSON.parse(kIn))
                } catch (error) {
                    const msg = handleRuntypeFail(error);
                    return oraRun.fail(msg)
                }

                // add existing key to current identity
                const skResp = await addExistingKeyPair(identity, stdinKeyPair, true);
                if (skResp.success === false) return oraRun.fail(skResp.message);

                identity = skResp.identity;
                break;
            }
            default: {
                // create a new key based on kid and add it to the identity
                const nkResp = await addNewKeyPair(identity, kid);
                if (nkResp.success === false) return oraRun.fail(nkResp.message);

                identity = nkResp.identity;
                break;
            }
        }

        // store full identity
        const addResp = await addIdentity(identity);

        if (addResp.success) {
            oraRun.succeed(addResp.message)
        } else {
            oraRun.fail(addResp.message);
        }
        return addResp.success;
    }
}
