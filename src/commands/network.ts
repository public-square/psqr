import { Command, flags } from '@oclif/command'

import { log, generateLogInput } from '../functions/log'
import { getNetworkConfig } from '../functions/network';

import { Static } from 'runtypes';
import { NetworkConfig } from '../types/network';

const ora = require('ora');

export default class Network extends Command {
    static description = `List Network config
Lists the config of the Network(s) as specified by flags.
Lists the defaults if not otherwise specified.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        domains: flags.string({ char: 'd', description: 'Colon (:) separated list of domains of specific Network(s) to list' }),
        all: flags.boolean({ char: 'a', default: false, description: 'List all current Network configs' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'Output only the raw Network config' }),
    }

    static args = []

    async run() {
        const { flags } = this.parse(Network)

        const oraStart = ora('Preparing command...').start();

        const logInput = generateLogInput(process.argv);

        let configs;
        if (flags.all) {
            configs = await getNetworkConfig(true);

            logInput.title = 'All Current Network Configs';
        } else if (typeof flags.domains !== 'undefined' && flags.domains.length > 0) {
            configs = await getNetworkConfig(flags.domains);

            logInput.title = 'Requested Network Configs';
        } else {
            configs = await getNetworkConfig();

            logInput.title = 'Default Network Configs';
        }

        if (configs.success === false) return oraStart.fail(configs.message);

        oraStart.succeed('Retrieved Network Configs');
        if (flags.raw === true) return console.log(configs.data);

        logInput.code = configs.data.map((c: Static<typeof NetworkConfig>) => {
            const obj = {
                key: c.name,
                obj: c,
            }
            return obj;
        })
        log(logInput);
    }
}
