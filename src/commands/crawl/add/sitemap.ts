import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { getIdentity } from '../../../functions/identity';
import { writeSitemapCrawl } from '../../../functions/crawl';
import { handleRuntypeFail } from '../../../functions/utility';
import { Sitemap } from '../../../types/crawl';

const ora = require('ora');

/**
 * Creates or Updates a Sitemap Crawl Configuration.
 */
export default class CrawlAddSitemap extends Command {
    static description = 'Create or update a Sitemap crawl config'

    static flags = {
        help: flags.help({ char: 'h' }),
        geo: flags.string({ char: 'g', description: 'Specify the default geo value' }),
        lang: flags.string({ char: 'l', description: 'Specify the default lang value' }),
        politicalSubdivision: flags.string({ char: 'p', description: 'Specify the default politicalSubdivision value' }),
        image: flags.string({ char: 'i', description: 'Specify the default image value' }),
        markupInclude: flags.string({ char: 'm', description: 'List of markup tags divided by the pipe symbol (|). Include only these markup tags' }),
        markupExclude: flags.string({ char: 'n', description: 'List of markup tags divided by the pipe symbol (|). Include everything but these markup tags' }),
        pathInclude: flags.string({ char: 'q', description: 'List of paths divided by the pipe symbol (|). Include only urls with this path' }),
        pathExclude: flags.string({ char: 'r', description: 'List of paths divided by the pipe symbol (|). Include every url except for those with this path' }),
        since: flags.string({ char: 's', default: '1d', description: 'Include all posts that have been created since now - this flag. This filters based on lastmod and defaults to 1d. Set to 0 to skip.' }),
        filterTitle: flags.string({ char: 't', description: 'List of titles to never use divided by the pipe symbol (|).' }),
        filterDescription: flags.string({ char: 'd', description: 'List of descriptions to never use divided by the pipe symbol (|).' }),
        filterImage: flags.string({ char: 'e', description: 'List of images to never use divided by the pipe symbol (|).' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'DID and Key to be used for posts',
        },
        {
            name: 'url',
            description: 'url for sitemap',
        },
    ]

    async run() {
        const { args, flags } = this.parse(CrawlAddSitemap)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.kid === 'undefined' || typeof args.url === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['crawl:add:sitemap', '-h']);
        }

        const kid = args.kid;
        const url = args.url;

        oraStart.succeed('Command ready')
        const oraCreate = ora('Adding new Sitemap config...').start();

        let config: Static<typeof Sitemap>;

        try {
            // ensure kid references an identity that exists
            const iResp = await getIdentity(kid);
            if (iResp.success === false) return oraCreate.fail(iResp.message);

            // set config and check type
            config = Sitemap.check({
                type: 'sitemap',
                kid,
                defaults: {
                    geo: flags.geo || '',
                    lang: flags.lang || 'en',
                    politicalSubdivision: flags.politicalSubdivision || '',
                    image: flags.image || '',
                },
                lastPost: '',
                url,
                since: flags.since,
                filters: {
                    crawl: {
                        path: {
                            includes: flags.pathInclude?.split('|') || [],
                            excludes: flags.pathExclude?.split('|') || [],
                        },
                        markup: {
                            includes: flags.markupInclude?.split('|') || [],
                            excludes: flags.markupExclude?.split('|') || [],
                        },
                    },
                    value: {
                        body: [],
                        description: flags.filterDescription?.split('|') || [],
                        lang: [],
                        publishDate: [],
                        title: flags.filterTitle?.split('|') || [],
                        geo: [],
                        politicalSubdivision: [],
                        image: flags.filterImage?.split('|') || [],
                        canonicalUrl: [],
                        reply: [],
                    },

                },
            })
        } catch (error) {
            const msg = handleRuntypeFail(error);
            return oraCreate.fail(msg);
        }

        const resp = writeSitemapCrawl(config);
        if (resp.success === false) {
            oraCreate.fail(resp.message)
            return false
        }
        oraCreate.succeed(resp.message);
    }
}
