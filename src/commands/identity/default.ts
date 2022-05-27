import { Command, flags, run as runCommand } from '@oclif/command'

import { setDefaultIdentity } from '../../functions/identity';

const ora = require('ora');

/**
 * Set the Default Identity using the KID.
 */
export default class IdentityDefault extends Command {
    static description = 'Set the default identity using the KID'

    static flags = {
        help: flags.help({ char: 'h' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        },
    ]

    async run() {
        const { args } = this.parse(IdentityDefault)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:default', '-h']);
        }

        const kid = args.kid;

        oraStart.succeed('Command ready')
        const oraRun = ora('Setting Default Identity...').start();

        const defResp = setDefaultIdentity(kid);

        if (defResp.success) {
            oraRun.succeed(defResp.message)
        } else {
            oraRun.fail(defResp.message);
        }
        return defResp.success;
    }
}
