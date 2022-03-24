import { Command, flags, run as runCommand } from '@oclif/command'

import { crawlTypes, CrawlType, setDefaultCrawl } from '../../functions/crawl';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class CrawlDefault extends Command {
    static description = `Set the default Crawl(s)
Default behavior is to add specified Crawl(s) to defaults.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        overwrite: flags.boolean({ char: 'o', default: false, description: 'Overwrite the current defaults with specified Crawl(s)' }),
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
            description: 'DID of the identity that you want to crawl',
        },
    ]

    async run() {
        const { args, flags } = this.parse(CrawlDefault)

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.did = await getStdin();

        if (typeof args.type !== typeof args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['crawl:default', '-h']);
        }

        const type: CrawlType = args.type;
        const dids = args.did.split('\n').filter((s: string) => s !== '').join(',');
        const overwrite = flags.overwrite;

        oraStart.succeed('Command ready')
        const oraSet = ora('Setting Default Crawl(s)...').start();

        const resp = setDefaultCrawl(type, dids, overwrite);
        if (resp.success === false) {
            oraSet.fail(resp.message)
            return false
        }
        oraSet.succeed(resp.message);
    }
}
