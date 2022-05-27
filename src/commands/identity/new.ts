import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { createIdentity, addIdentity, setDefaultIdentity } from '../../functions/identity';
import { handleRuntypeFail } from '../../functions/utility';
import { KID_PSQR } from '../../types/base-types';
import { PublicInfo } from '../../types/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Creates a new default identity from a provided KID URL.
 */
export default class IdentityNew extends Command {
    static description = `Create a new default identity
This command creates a new identity from a provided KID URL,
adds it to the psqr config, and sets it as the default.
This only supports creating did:psqr identities.`

    static flags = {
        help: flags.help({ char: 'h' }),
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
            description: 'KID PSQR string, expected format: did:psqr:{hostname}/{path}#{keyId}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(IdentityNew)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.kid === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:new', '-h']);
        }

        if (typeof flags.name === 'undefined' && flags.stdin === false) {
            oraStart.fail('Insufficient arguments provided; Name needs to be specified as a flag or with stdin\n')
            return runCommand(['identity:new', '-h']);
        }

        // validate and assign kid
        let kid: Static<typeof KID_PSQR>;
        try {
            kid = KID_PSQR.check(args.kid);
        } catch (error) {
            oraStart.fail('Invalid KID PSQR string specified, expected format: did:psqr:{hostname}/{path}#{keyId}');
            return false;
        }

        oraStart.succeed('Command ready')
        const oraCreate = ora('Creating new identity...').start();

        // parse or assemble publicIdentity
        let info;
        if (flags.stdin) {
            const stdInfo = await getStdin();
            info = JSON.parse(stdInfo);
        } else if (typeof flags.name === 'string') {
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
            return oraCreate.fail('Invalid name provided');
        }

        // validate publicIdentity
        try {
            PublicInfo.check(info)
        } catch (error) {
            const msg = handleRuntypeFail(error);
            oraCreate.fail(msg);
            return false;
        }

        // finally create the full identity
        const newId = await createIdentity(kid, info);
        if (newId.success === false) return oraCreate.fail(newId.message);
        const identity = newId.identity;

        oraCreate.succeed(newId.message)
        const oraAdd = ora('Adding new identity...').start();

        // add the identity
        const addResp = await addIdentity(identity);
        addResp.success ? oraAdd.succeed(addResp.message) : oraAdd.fail(addResp.message);

        // set newly added identity as default
        const oraDef = ora('Setting new identity as default...').start();
        const defResp = setDefaultIdentity(kid);
        defResp.success ? oraDef.succeed(defResp.message) : oraDef.fail(defResp.message);

        return true;
    }
}
