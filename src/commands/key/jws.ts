import { Command, flags, run as runCommand } from '@oclif/command';

import { createJWS } from '../../functions/post';
import { getVars } from '../../functions/env';
import { createFiles, retrieveFiles } from '../../functions/utility';
import { getKeyPair } from '../../functions/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Generates a JWS for an arbitrary string with specified key.
 */
export default class KeyJws extends Command {
    static description = 'Generate a JWS for an arbitrary string with specified key.'

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as DATA' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'DATA specified is raw (not a filepath), you need to escape "' }),
        kid: flags.string({ char: 'k', description: 'KID string' }),
    }

    static args = [
        {
            name: 'data',
            description: 'Relative path to file with string data',
        },
    ]

    async run() {
        const { args, flags } = this.parse(KeyJws)

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.data = await getStdin();

        if (typeof args.data === 'undefined' || args.data === '') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['key:jws', '-h']);
        }

        const env = getVars();

        if (flags.kid === null && env.DEFAULT_DID === null) {
            oraStart.fail('You need to specify a KID either as a flag with this command or set it in the psqr env');
            return false;
        }

        if (flags.kid === null && env.DEFAULT_KEY === null) {
            oraStart.fail('You need to specify a Key ID either as a flag with this command or set it in the psqr env');
            return false;
        }

        oraStart.succeed('Command ready')
        const oraCreate = ora('Creating JWS...').start();

        // get keyPair object
        const kid = flags.kid || '';
        const kpResp = await getKeyPair(kid);
        if (kpResp.success === false) return oraCreate.fail(kpResp.message);
        const keyPair = kpResp.keyPairs[0];

        // get content data, from file if needed
        let content = args.data;
        if (flags.raw === false && flags.stdin === false) {
            const cResp = await retrieveFiles([{
                path: content,
                relative: true,
            }])
            if (cResp.success === false || typeof cResp.files[0] !== 'object') return oraCreate.fail(cResp.message);
            content = cResp.files[0].data;
        }

        // sign data to create JWS
        const resp = await createJWS(content, keyPair, false);
        if (resp.success === false || typeof resp.data === 'undefined') {
            oraCreate.fail(resp.message);
            return false;
        }

        const { jws } = resp.data;
        oraCreate.succeed(resp.message);
        const oraSave = ora('Saving JWS...').start();

        const jwsFile = await createFiles([
            {
                path: keyPair.kid.replace(/[:/]/g, '-') + '-' + Date.now() + '.jws',
                relative: true,
                data: jws.token,
            },
        ]);

        if (jwsFile.success) {
            oraSave.succeed(`${jwsFile.message}\nGenerated JWS at: ${jwsFile.files[0]}`);
        } else {
            oraSave.fail(jwsFile.message);
        }
    }
}
