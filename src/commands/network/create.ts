import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { createNetworkConfig } from '../../functions/network'
import { handleRuntypeFail } from '../../functions/utility';
import { NetworkConfig } from '../../types/network';

const ora = require('ora');

export default class NetworkCreate extends Command {
    static description = 'Create a new Network config'

    static flags = {
        help: flags.help({ char: 'h' }),
        search: flags.string({char: 's', description: 'Url to use instead of search default (search.[domain])'}),
        list: flags.string({char: 'l', description: 'Url to use instead of list default (list.[domain])'}),
        feed: flags.string({char: 'f', description: 'Url to use instead of feed default (feed.[domain])'}),
        link: flags.string({char: 'i', description: 'Url to use instead of link default (link.[domain])'}),
        beacon: flags.string({char: 'b', description: 'Url to use instead of beacon default (beacon.[domain])'}),
        api: flags.string({char: 'a', description: 'Url to use instead of api default ([domain]/api)'}),
    }

    static args = [
        {
            name: 'domain',
            description: 'Root domain of the network',
        },
        {
            name: 'name',
            description: 'Friendly name to reference this Network',
        },
    ]

    async run() {
        const { args, flags } = this.parse(NetworkCreate)

        const oraStart = ora('Preparing command...').start();

        if (args.domain === null || args.name === null) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['network:create', '-h']);
        }

        const domain = args.domain;
        const name = args.name;

        oraStart.succeed('Command ready')
        const oraCreate = ora('Create New Network...').start();

        let config: Static<typeof NetworkConfig>;
        try {
            config = NetworkConfig.check({
                name: name,
                domain: domain,
                content: {
                    search:  {
                        url: flags.search || `https://search.${domain}`
                    },
                    list:   {
                        url: flags.list || `https://list.${domain}`
                    },
                    feed:   {
                        url: flags.feed || `https://feed.${domain}`
                    },
                    link:   {
                        url: flags.link || `https://link.${domain}`
                    },
                    beacon:   {
                        url: flags.beacon || `https://beacon.${domain}`
                    }
                },
                services: {
                    api:   {
                        url: flags.api || `https://${domain}/api`,
                    }
                }
            })
        } catch (error) {
            const msg = handleRuntypeFail(error);
            return oraCreate.fail(msg);
        }

        const resp = createNetworkConfig(config);
        if (resp.success === false) {
            oraCreate.fail(resp.message)
            return false
        }
        oraCreate.succeed(resp.message);
    }
}
