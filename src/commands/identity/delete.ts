import { Command, flags, run as runCommand } from '@oclif/command'
import { parseJwk } from 'jose/jwk/parse';
import { CompactSign } from 'jose/jws/compact/sign';

import { parseKidKey, verifyAdminIdentity } from '../../functions/identity';
import { createIdentityAxiosClient } from '../../functions/utility';

const ora = require('ora');

const encoder = new TextEncoder();

export default class IdentityDelete extends Command {
    static description = 'Remove an Identity from a Public Square Network that hosts Identities.';

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
        const { args } = this.parse(IdentityDelete);

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined' && !args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:delete', '-h']);
        }

        // get did from command line
        const did = args.did;

        oraStart.succeed('Command ready');

        const oraRun = ora('Deleting Identity...').start();

        // verify admin identity via DID
        const idResp = await verifyAdminIdentity(did);
        if (idResp.success === false) return oraRun.fail(`Unable to delete identity because ${idResp.message}`);

        // parse data
        const keyPair = idResp.identity.keyPairs[0];
        const key = await parseJwk(keyPair.private);

        const keyId = parseKidKey(keyPair.kid);
        if (keyId === false) return { success: false, message: 'Unable to parse key name' };

        const signature = await new CompactSign(encoder.encode(JSON.stringify(idResp.identity.didDoc)))
            .setProtectedHeader({
                alg: 'ES384',
                kid: keyPair.kid,
            })
            .sign(key);

        // create axios client for API endpoint with signature and PUT method
        const axResp = await createIdentityAxiosClient(did, 'DELETE', signature);

        if (axResp.success) {
            oraRun.succeed(`Successfully deleted the Identity for: ${did}`);
        } else {
            oraRun.fail(`Unable to delete identity because ${axResp.message}`);
        }
    }
}
