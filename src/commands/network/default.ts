import { Command, flags, run as runCommand } from '@oclif/command'

import { setDefaultNetwork } from '../../functions/network'

const ora = require('ora');

/**
 * Sets the default Network(s).
 */
export default class NetworkDefault extends Command {
    static description = `Set the default Network(s)
Default behavior is to add specified Network(s) to defaults.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        overwrite: flags.boolean({ char: 'o', default: false, description: 'Overwrite the current defaults with specified Network(s)' }),
    }

    static args = [
        {
            name: 'domains',
            description: 'Colon (:) separated list of Network(s) to set as default',
        },
    ]

    async run() {
        const { args, flags } = this.parse(NetworkDefault)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.domains === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['network:default', '-h']);
        }

        const domains = args.domains;
        const overwrite = flags.overwrite;

        oraStart.succeed('Command ready')
        const oraSet = ora('Setting Default Network(s)...').start();

        const resp = setDefaultNetwork(domains, overwrite);
        if (resp.success === false) {
            oraSet.fail(resp.message)
            return false
        }
        oraSet.succeed(resp.message);
    }
}
