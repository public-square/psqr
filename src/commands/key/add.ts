import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { addExistingKeyPair, addIdentity, getFullIdentity, parseBareDid, parseKidKey } from '../../functions/identity';
import { FileConfig, handleRuntypeFail, retrieveFiles } from '../../functions/utility';
import { KeyPair } from '../../types/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class KeyAdd extends Command {
    static description = `Add a pre-existing Key to an identity stored in the cli config.
Specify the path to the directory containing them with --path,
or pass the entire KeyPair as a JSON string with --stdin.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as KeyPair. Expected JSON string format: { kid, private, public }' }),
        path: flags.string({ char: 'p', description: 'Use the keys from this directory. Expected files are private.jwk and public.jwk' }),
        absolute: flags.boolean({ char: 'a', default: false, description: 'Key directory path is an absolute path' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(KeyAdd)

        const oraStart = ora('Preparing command...').start();

        const keySpecified = typeof flags.path !== 'undefined' || flags.stdin;
        if (args.kid === null || keySpecified === false) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['key:add', '-h']);
        }

        const kid = args.kid;

        // separate bare did and key name
        const bdid = parseBareDid(kid);
        if (bdid === false) return oraStart.fail('Unable to parse bare did from kid ' + kid);
        const keyName = parseKidKey(kid);
        if (keyName === false) return oraStart.fail('Unable to parse key name from kid ' + kid);

        // retrieve identity
        const idResp = await getFullIdentity(bdid);
        if (idResp.success === false) {
            return oraStart.fail('Unable to retrieve full identity because: ' + idResp.message);
        }
        let identity = idResp.identity;

        oraStart.succeed('Command ready')
        const oraValid = ora('Retrieving and validating Key Pair...').start();

        let keyPair;
        if (typeof flags.path === 'undefined') {
            // get stdin
            const kIn = await getStdin();
            if (kIn === null || kIn === '') return oraValid.fail('Invalid stdin');

            // assemble and validate new key pair
            let stdinKeyPair: Static<typeof KeyPair>;
            try {
                stdinKeyPair = KeyPair.check(JSON.parse(kIn))
            } catch (error) {
                const msg = handleRuntypeFail(error);
                return oraValid.fail(msg)
            }

            keyPair = stdinKeyPair;
        } else {
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
            if (kfResp.success === false) return oraValid.fail('Unable to find keys at ' + flags.path)

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
                return oraValid.fail('Unable to find keys at ' + flags.path)
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
                return oraValid.fail(msg)
            }

            keyPair = fileKeyPair;
        }

        oraValid.succeed('Key Pair valid')
        const oraAdd = ora('Adding Key Pair...').start();

        // add existing key to current identity
        const skResp = await addExistingKeyPair(identity, keyPair, true);
        if (skResp.success === false) return oraAdd.fail(skResp.message);

        identity = skResp.identity;

        // store full identity
        const addResp = await addIdentity(identity);

        if (addResp.success) {
            oraAdd.succeed(`Successfully added ${keyName} to ${bdid}`)
        } else {
            oraAdd.fail(addResp.message);
        }
        return addResp.success;
    }
}
