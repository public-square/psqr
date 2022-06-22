import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { getIdentity, addIdentity, refreshDid } from '../../functions/identity';
import { handleRuntypeFail } from '../../functions/utility';
import { DID_PSQR } from '../../types/base-types';
import { PublicInfo, Identity } from '../../types/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class IdentityUpdate extends Command {
    static description = `Update a local Identity with specified info or from the hosted DID doc.
This will update the updated timestamp and will only apply locally.
Use identity:propagate to propagate the changes to the hosted DID doc.
This does not affect keys or permissions granted.
Use the fetch flag to update the local doc.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        fetch: flags.boolean({ char: 'f', default: false, description: 'Fetch the hosted DID doc from the url specified by the DID and update the local DID doc' }),
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
            name: 'did',
            description: 'DID PSQR string of the identity to update, expected format: did:psqr:{hostname}/{path}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(IdentityUpdate)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:update', '-h']);
        }

        // validate and assign kid
        let did: Static<typeof DID_PSQR>;
        try {
            did = DID_PSQR.check(args.did);
        } catch (error) {
            oraStart.fail('Invalid DID PSQR string specified, expected format: did:psqr:{hostname}/{path}');
            return false;
        }

        if (flags.fetch === true) {
            oraStart.succeed('Command ready');
            const oraFetch = ora(`Getting DID doc for ${did} to update local...`);

            // refresh DID doc
            const fetchResp = await refreshDid(did);
            if (fetchResp.success === false) {
                const msg = handleRuntypeFail(fetchResp.error);
                oraFetch.fail(`Unable to fetch DID doc because: ${msg}`);
            }

            return oraFetch.succeed(`Successfully fetched the DID doc for ${did}`);
        }

        // get current identity info
        const currentResp = await getIdentity(did);
        if (currentResp.success === false) {
            oraStart.fail(`Unable to get specified identity because: ${currentResp.message}`);
            return false;
        }
        const currentId: Static<typeof Identity> = currentResp.identity;
        const info: Static<typeof PublicInfo> = JSON.parse(JSON.stringify(currentId.didDoc.psqr.publicIdentity));

        oraStart.succeed('Command ready')
        const oraUpdate = ora(`Updating identity ${did}...`).start();

        // parse or assemble publicIdentity
        let newInfo: Static<typeof PublicInfo> = {
            name: info.name,
        };
        if (flags.stdin) {
            const stdInfo = await getStdin();
            newInfo = JSON.parse(stdInfo);
        } else {
            if (flags.name !== undefined) newInfo.name = flags.name;
            if (flags.image !== undefined) newInfo.image = flags.image;
            if (flags.url !== undefined) newInfo.url = flags.url;
            if (flags.tagline !== undefined) newInfo.tagline = flags.tagline;
            if (flags.bio !== undefined) newInfo.bio = flags.bio;
            if (flags.description !== undefined) newInfo.description = flags.description;
        }

        // combine and validate publicIdentity
        try {
            Object.assign(info, newInfo);
            PublicInfo.check(info)
        } catch (error) {
            const msg = handleRuntypeFail(error);
            oraUpdate.fail(msg);
            return false;
        }

        // assign new publicIdentity to current identity and update
        currentId.didDoc.psqr.publicIdentity = info;
        currentId.didDoc.psqr.updated = Date.now();
        const updateResp = await addIdentity(currentId, false);
        if (updateResp.success === false) {
            oraUpdate.fail(`Unable to add newly updated identity because: ${updateResp.message}`);
            return false;
        }

        oraUpdate.succeed(`Successfully updated ${did}`);
    }
}
