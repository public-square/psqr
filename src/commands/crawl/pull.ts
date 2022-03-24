import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { FeedList, crawlFeeds, crawlTypes, CrawlType, assembleCrawlConfigs } from '../../functions/crawl'
import { getVars } from '../../functions/env';
import { parseBareDid } from '../../functions/identity';
import { createFiles, FileConfig } from '../../functions/utility';
import { ProxyConfig } from '../../types/interfaces';
import { Post } from '../../types/post';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class CrawlPull extends Command {
    static description = `Crawl new Posts from feeds.
Don't specify any arguments in order to use the defaults.
If you want to crawl multiple configs use stdin or set them as the defaults.
New posts from all feeds are retrieved and stored in their feed directories
or locally if specified.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        proxy: flags.boolean({ char: 'p', default: false, description: 'Use a proxy for each request' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as a list of newline separated DIDs. They are assumed to all be the same type.' }),
        local: flags.boolean({ char: 'l', default: false, description: 'Save all the posts in the current directory instead of the crawl dir' }),
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
        const { flags, args } = this.parse(CrawlPull)

        const env = getVars();

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.did = await getStdin();

        if (typeof args.type !== typeof args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['crawl:pull', '-h']);
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

        // setup proxy
        let proxy: ProxyConfig = false;
        if (flags.proxy) {
            const msg = 'ENV vars PROXY_HOST, PROXY_PORT, PROXY_USER, and PROXY_PASS need to be set in order to use a proxy.';
            if (typeof env.PROXY_HOST === 'undefined') return oraStart.fail(msg);
            if (typeof env.PROXY_PORT === 'undefined') return oraStart.fail(msg);
            if (typeof env.PROXY_USER === 'undefined') return oraStart.fail(msg);
            if (typeof env.PROXY_PASS === 'undefined') return oraStart.fail(msg);

            proxy = {
                host: env.PROXY_HOST,
                port: parseInt(env.PROXY_PORT),
                auth: env.PROXY_USER + ':' + env.PROXY_PASS,
            }
        }

        oraConfigs.succeed('Configs found');
        const oraCreate = ora('Getting Feed Posts...').start();

        // crawl feeds and get posts
        const resp = await crawlFeeds(configs, flags.local === false, proxy);
        if (resp.success === false) {
            oraCreate.fail(resp.message);
            return false;
        }

        oraCreate.succeed(resp.message);
        if (flags.local === true) {
            const oraSave = ora('Saving Posts Locally...').start();

            const files: FileConfig[] = [];
            resp.items.forEach(i => {
                const bdid = parseBareDid(i.data.config.kid);
                const dir = bdid === false ? i.data.config.kid.replace(/:/g, '-') : bdid.replace(/:/g, '-');
                const fcs = i.data.posts.map((p: Static<typeof Post>) => {
                    return {
                        path: `${dir}/post-${p.infoHash}.json`,
                        relative: true,
                        data: JSON.stringify(p, null, 4),
                    }
                })

                files.push(...fcs);
            })

            // create post files
            const postFile = await createFiles(files);

            if (postFile.success) {
                oraSave.succeed(`${postFile.message}\nGenerated posts: \n ${JSON.stringify(postFile.files, null, 4)}`);
            } else {
                oraSave.fail(postFile.message);
            }
        }
    }
}
