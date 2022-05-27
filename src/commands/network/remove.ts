import { Command, flags, run as runCommand } from '@oclif/command'

import { removeNetworkConfig } from '../../functions/network'

const ora = require('ora');

/**
 * Removes a Networks Configuration based on a list of Networks.
 */
export default class NetworkRemove extends Command {
    static description = 'Remove Network configs'

    static flags = {
        help: flags.help({ char: 'h' }),
    }

    static args = [
        {
            name: 'domains',
            description: 'Colon (:) separated list of Network(s) to remove',
        },
    ]

    async run() {
        const { args } = this.parse(NetworkRemove)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.domains === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['network:remove', '-h']);
        }

        const domains = args.domains;

        oraStart.succeed('Command ready')
        const oraSet = ora('Removing specified Network(s)...').start();

        const resp = await removeNetworkConfig(domains);
        if (resp.success === false) {
            oraSet.fail(resp.message)
            return false
        }
        oraSet.succeed(resp.message);
    }
}
