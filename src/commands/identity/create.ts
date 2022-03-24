import { Command, flags, run as runCommand } from '@oclif/command'

import { Static } from 'runtypes';

import { createIdentity, addIdentity, parseKidKey } from '../../functions/identity';
import { createFiles, FileConfig, handleRuntypeFail } from '../../functions/utility';
import { PublicInfo } from '../../types/identity';

const ora = require('ora');
const getStdin = require('get-stdin');

export default class IdentityCreate extends Command {
    static description = `Create a new identity from a provided KID and add it to the psqr config.
This only supports creating did:psqr identities.`

    static flags = {
        help: flags.help({ char: 'h' }),
        local: flags.boolean({ char: 'l', default: false, description: 'Store the identity locally instead of in the psqr config' }),
        keys: flags.string({ char: 'k', description: 'List of comma separated key names to create. Overrides keyId from end of KID' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as full JSON publicIdentity string' }),

        name: flags.string({ char: 'n', description: 'publicIdentity name, REQUIRED if no STDIN input' }),
        image: flags.string({ char: 'i', description: 'publicIdentity image url' }),
        url: flags.string({ char: 'u', description: 'publicIdentity url' }),
        tagline: flags.string({ char: 't', description: 'publicIdentity tagline' }),
        bio: flags.string({ char: 'b', description: 'publicIdentity bio' }),
        description: flags.string({ char: 'd', description: 'publicIdentity description' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID string, expected format: did:psqr:{hostname}/{path}#{keyId}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(IdentityCreate)

        const oraStart = ora('Preparing command...').start();

        if (args.kid === null || (typeof flags.name === 'undefined' && flags.stdin === false)) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:create', '-h']);
        }

        const kid = args.kid;

        oraStart.succeed('Command ready')
        const oraCreate = ora('Creating Identity...').start();

        let keyNames: string[] = [];
        if (typeof flags.keys !== 'undefined' && flags.keys !== '' && flags.keys.split(',').length > 0) {
            keyNames = flags.keys.split(',');
        }

        // parse or assemble publicIdentity
        let info;
        if (flags.stdin) {
            const stdInfo = await getStdin();
            info = JSON.parse(stdInfo);
        } else if (typeof flags.name == 'string') {
            const newInfo: Static<typeof PublicInfo> = {
                name: flags.name,
            };

            if (flags.image !== undefined) newInfo.image = flags.image;
            if (flags.url !== undefined) newInfo.url = flags.url;
            if (flags.tagline !== undefined) newInfo.tagline = flags.tagline;
            if (flags.bio !== undefined) newInfo.bio = flags.bio;
            if (flags.description !== undefined) newInfo.description = flags.description;

            info = newInfo;
        } else {
            return oraStart.fail('Invalid name provided');
        }

        // validate publicIdentity
        try {
            PublicInfo.check(info)
        } catch (error) {
            const msg = handleRuntypeFail(error);
            oraCreate.fail(msg);
            return false;
        }

        const newId = await createIdentity(kid, info, keyNames);

        if (newId.success === false) {
            oraCreate.fail(newId.message)
            return false;
        }

        oraCreate.succeed(newId.message);
        const oraSave = ora('Saving Identity...').start();

        // if true save identity locally as individual files
        if (flags.local === true) {
            const didDoc = newId.identity.didDoc;
            const keyPairs = newId.identity.keyPairs;

            const files: FileConfig[] = [
                {
                    path: 'identity.json',
                    relative: true,
                    data: didDoc,
                },
            ]

            for (let i = 0; i < keyPairs.length; i++) {
                const keyPair = keyPairs[i];
                const keyName = parseKidKey(keyPair.kid);
                if (keyName === false) continue;

                files.push(
                    {
                        path: `${keyName}.public.jwk`,
                        relative: true,
                        data: keyPair.public,
                    },
                    {
                        path: `${keyName}.private.jwk`,
                        relative: true,
                        data: keyPair.private,
                    }
                );
            }

            const nf = await createFiles(files);

            let msg = nf.message;
            if (nf.success) {
                for (let i = 0; i < nf.files.length; i++) {
                    const f = nf.files[i];
                    msg += '\nCreated File: ' + f;
                }
            } else {
                oraSave.fail(msg);
            }

            oraSave.succeed(msg);

            return nf.success;
        }

        // if not saving to a local file, store in psqr dir
        const addResp = await addIdentity(newId.identity);
        if (addResp.success) {
            oraSave.succeed(addResp.message)
        } else {
            oraSave.fail(addResp.message);
        }

        return addResp.success;
    }
}
