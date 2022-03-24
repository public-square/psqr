import { Command, flags, run as runCommand } from '@oclif/command'

import { getIdentity } from '../../../functions/identity';
import { writeRSSCrawl } from '../../../functions/crawl';
import { handleRuntypeFail } from '../../../functions/utility';
import { RSS } from '../../../types/crawl';

const ora = require('ora');

export default class CrawlAddRss extends Command {
    static description = 'Create a new RSS Crawl config'

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
            name: 'url',
            description: 'Url to RSS feed',
        },
    ]

    async run() {
        const { args, flags } = this.parse(CrawlAddRss)

        const oraStart = ora('Preparing command...').start();

        if (args.kid === null || args.url === null) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['crawl:add:rss', '-h']);
        }

        const kid = args.kid;
        const url = args.url;

        oraStart.succeed('Command ready')
        const oraCreate = ora('Adding new RSS feed...').start();

        let config;

        try {
            // ensure kid references an identity that exists
            const iResp = await getIdentity(kid);
            if (iResp.success === false) return oraCreate.fail(iResp.message);

            // set config and check type
            config = RSS.check({
                type: 'rss',
                url,
                kid,
                etag: '',
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

        const resp = writeRSSCrawl(config);
        if (resp.success === false) {
            oraCreate.fail(resp.message)
            return false
        }
        oraCreate.succeed(resp.message);
    }
}
