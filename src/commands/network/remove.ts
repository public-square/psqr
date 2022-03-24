import { Command, flags, run as runCommand } from '@oclif/command'

import { removeNetworkConfig } from '../../functions/network'

const ora = require('ora');

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

        if (args.domains === null) {
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
