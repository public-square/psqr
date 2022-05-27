import { Command, flags, run as runCommand } from '@oclif/command'

import { crawlTypes, removeCrawl } from '../../functions/crawl';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Removes Crawl Configurations.
 */
export default class CrawlRemove extends Command {
    static description = `Remove Crawl configs.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as a list of newline separated DIDs.' }),
    }

    static args = [
        {
            name: 'type',
            description: 'The type of crawl you want to use',
            options: crawlTypes,
        },
        {
            name: 'did',
            description: 'DID of the crawl config that you want to remove',
        },
    ]

    async run() {
        const { flags, args } = this.parse(CrawlRemove)

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.did = await getStdin();

        if (typeof args.type === 'undefined' || typeof args.did === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['crawl:remove', '-h']);
        }

        const type = args.type;
        const dids = args.did.split('\n').filter((s: string) => s !== '').join(',');

        oraStart.succeed('Command ready')
        const oraSet = ora('Removing specified Crawl(s)...').start();

        const resp = await removeCrawl(type, dids);
        if (resp.success === false) {
            oraSet.fail(resp.message)
            return false
        }
        oraSet.succeed(resp.message);
    }
}
