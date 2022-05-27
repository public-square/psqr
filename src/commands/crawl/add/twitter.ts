import { Command, flags, run as runCommand } from '@oclif/command'

import { getIdentity } from '../../../functions/identity';
import { writeTwitterCrawl } from '../../../functions/crawl';
import { handleRuntypeFail } from '../../../functions/utility';
import { Twitter } from '../../../types/crawl';

const ora = require('ora');

/**
 * Creates a new Twitter Crawl Configuration.
 */
export default class CrawlAddTwitter extends Command {
    static description = 'Create a new Twitter Crawl config'

    static flags = {
        help: flags.help({ char: 'h' }),
        geo: flags.string({ char: 'g', description: 'Specify the default geo value' }),
        lang: flags.string({ char: 'l', description: 'Specify the default lang value' }),
        politicalSubdivision: flags.string({ char: 'p', description: 'Specify the default politicalSubdivision value' }),
        image: flags.string({ char: 'i', description: 'Specify the default image value' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'DID and Key to be used for posts',
        },
        {
            name: 'username',
            description: '@ username for Twitter user',
        },
    ]

    async run() {
        const { args, flags } = this.parse(CrawlAddTwitter)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.kid === 'undefined' || typeof args.username === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['crawl:add:twitter', '-h']);
        }

        const kid = args.kid;
        const username = args.username;

        oraStart.succeed('Command ready')
        const oraCreate = ora('Adding new Twitter user...').start();

        let config;
        try {
            // ensure kid references an identity that exists
            const iResp = await getIdentity(kid);
            if (iResp.success === false) return oraCreate.fail(iResp.message);

            // set config and check type
            config = Twitter.check({
                type: 'twitter',
                username,
                userId: 0,
                kid,
                lastTweet: '',
                defaults: {
                    geo: flags.geo || '',
                    lang: flags.lang || 'en',
                    politicalSubdivision: flags.politicalSubdivision || '',
                    image: flags.image || '',
                },
                lastPost: '',
            })
        } catch (error) {
            const msg = handleRuntypeFail(error);
            return oraCreate.fail(msg);
        }

        const resp = await writeTwitterCrawl(config);
        if (resp.success === false) {
            oraCreate.fail(resp.message)
            return false
        }
        oraCreate.succeed(resp.message);
    }
}
