import { Command, flags, run as runCommand } from '@oclif/command'
import { parseJwk } from 'jose/jwk/parse';
import { CompactSign } from 'jose/jws/compact/sign';

import { parseDidUrl, verifyAdminIdentity } from '../../functions/identity';
import { createIdentityAxiosClient } from '../../functions/utility';

const ora = require('ora');

const encoder = new TextEncoder();

export default class IdentityPropagate extends Command {
    static description = `Propagate an Identity to a Public Square Network that hosts Identities.
It will use any available admin key associated with the identity or it will throw an error if none are available.
`;

    static flags = {
        help: flags.help({ char: 'h' }),
    }

    static args = [
        {
            name: 'did',
            description: 'DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}',
        },
    ]

    async run() {
        const { args } = this.parse(IdentityPropagate);

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined' && !args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:propagate', '-h']);
        }

        // get did from command line
        const did = args.did;

        oraStart.succeed('Command ready');
        const oraRun = ora(`Propagating Identity to ${parseDidUrl(did)}...`).start();

        // verify admin identity via DID
        const idResp = await verifyAdminIdentity(did);
        if (idResp.success === false) {
            return oraRun.fail(idResp.message);
        }

        // there should only be 1 key pair included that has admin
        const keyPair = idResp.identity.keyPairs[0];
        const key = await parseJwk(keyPair.private);

        const signature = await new CompactSign(encoder.encode(JSON.stringify(idResp.identity.didDoc)))
            .setProtectedHeader({
                alg: 'ES384',
                kid: keyPair.kid,
            })
            .sign(key);

        // create axios client for API endpoint with signature and PUT method
        const axResp = await createIdentityAxiosClient(did, 'PUT', signature);

        if (axResp.success) {
            oraRun.succeed(`Successfully propagated the DID for ${did} to ${parseDidUrl(did)}`);
        } else {
            oraRun.fail(axResp.message);
        }
    }
}
