import { Command, flags, run as runCommand } from '@oclif/command'

import { getVars } from '../../functions/env';
import { CrawlConfig, crawlPath, removeCrawledPosts, signCrawledPosts, crawlLgr, crawlTypes, CrawlType, assembleCrawlConfigs, FeedList } from '../../functions/crawl';
import { PutConfig, putMultiplePosts } from '../../functions/post';
import { generateLogger } from '../../functions/utility';
import { parseBareDid } from '../../functions/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class CrawlPublish extends Command {
    static description = `Publish posts stored with and Crawler.
All posts that are in the posts dir of the Crawler will be signed,
published to the broadcasters, and then deleted unless otherwise specified.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        broadcasters: flags.string({ char: 'b', description: 'Colon (:) separated list of domains of Broadcaster(s) to publish to instead of the defaults' }),
        keep: flags.boolean({ char: 'k', default: false, description: 'Keep the posts stored with the crawler once they have been published' }),
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
        const { args, flags } = this.parse(CrawlPublish)
        const env = getVars();

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.did = await getStdin();

        if (typeof args.type !== typeof args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['crawl:publish', '-h']);
        }

        // get feed list values
        let noDefaults = false;
        const fl: FeedList = {
            rss: [],
            twitter: [],
            webhose: [],
            sitemap: [],
        }

        // do not use defaults if something is specified
        if (typeof args.did !== 'undefined') {
            noDefaults = true;

            // setup arg vars
            const type: CrawlType = args.type;
            const dids = args.did.split('\n').filter((s: string) => s !== '');

            // assign dids to proper type
            fl[type] = dids;
        }

        oraStart.succeed('Command ready');
        const oraConfigs = ora('Getting Crawl Configs...').start();

        // get configs
        const configs = await assembleCrawlConfigs(fl, noDefaults);
        if (configs.length === 0) return oraConfigs.fail('No Configs found');

        oraConfigs.succeed('Configs found');
        const oraSign = ora('Signing Posts...').start();

        const posts = [];
        for (let i = 0; i < configs.length; i++) {
            const config: CrawlConfig = configs[i];
            const did = parseBareDid(config.kid) || config.kid;

            // setup logging
            const logFile = `${crawlPath(did)}/log`;
            const lgr = generateLogger(logFile);
            lgr(`Publishing crawled posts from ${config.type} crawler ${did}`, true)

            // sign available posts
            const sResp = await signCrawledPosts(config, false);
            if (sResp.success === false) return oraSign.fail(sResp.message);
            posts.push(...sResp.data);
        }

        oraSign.succeed(`${posts.length} Posts Signed`);
        const oraPut = ora('Publishing Posts...');

        // publish all posts async with concurrent limiting
        const pc: PutConfig = {
            hash: '',
            broadcaster: flags.broadcasters || '',
            selfSigned: env.ALLOW_SELF_SIGNED === 'true',
        }
        const pubResp = await putMultiplePosts(posts, pc, crawlLgr);

        // indicate success of requests
        const pubSuccess = pubResp.filter(r => r.success);
        if (pubSuccess.length === 0) {
            oraPut.fail('Publishing failed for all posts');
        } else {
            let tb = 0;
            let sb = 0;
            pubSuccess.forEach(s => {
                tb += s.items.length;
                sb += s.items.filter(i => i.success).length;
            })
            oraPut.succeed(`${pubSuccess.length}/${pubResp.length} Posts Published to ${sb}/${tb} broadcasters`);
        }

        if (flags.keep === false) {
            const oraDel = ora('Deleting Crawled Posts...').start();

            let delSuccess = true;
            for (let i = 0; i < configs.length; i++) {
                const config: CrawlConfig = configs[i];
                const did = parseBareDid(config.kid) || config.kid;

                // remove posts from crawl dir
                const dResp = await removeCrawledPosts(did, posts.map(p => p.hash));
                if (dResp.files.length === 0) {
                    oraDel.fail('Deleting posts failed');
                    delSuccess = false;
                    break;
                }
            }

            if (delSuccess) oraDel.succeed('Posts Deleted');
        }
    }
}
