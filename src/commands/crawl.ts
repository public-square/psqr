import {Command, flags, run as runCommand} from '@oclif/command'
import {Static} from 'runtypes';
import {getVars} from '../functions/env';

import {FeedList, crawlFeeds, signCrawledPosts, crawlLgr, assembleCrawlConfigs, crawlTypes, CrawlType} from '../functions/crawl'
import {PutConfig, putMultiplePosts} from '../functions/post';
import {DataResponse, ProxyConfig} from '../types/interfaces';
import {JwsPost} from '../types/post';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Crawl new Posts from feeds and publish them.
 * If no arguments are specified, this will use the defaults.
 * If you want to crawl multiple configs, use stdin or set them as the defaults.
 */
export default class Crawl extends Command {
    static description = `Crawl new Posts from feeds and publish them.
Don't specify any arguments in order to use the defaults.
If you want to crawl multiple configs use stdin or set them as the defaults.
`

    static flags = {
        help: flags.help({char: 'h'}),
        proxy: flags.boolean({char: 'p', default: false, description: 'Use a proxy for each request'}),
        stdin: flags.boolean({char: 's', default: false, description: 'Use STDIN input as a list of newline separated DIDs. They are assumed to all be the same type.'}),
        broadcasters: flags.string({char: 'b', description: 'Comma (,) separated list of domains of Broadcaster(s) to publish to instead of the defaults'}),
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
        const {flags, args} = this.parse(Crawl)
        const env = getVars();

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.did = await getStdin();

        if (typeof args.type !== typeof args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['crawl', '-h']);
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
        const resp = await crawlFeeds(configs, false, proxy);
        if (resp.success === false) {
            oraCreate.fail(resp.message);
            return false;
        }

        oraCreate.succeed(resp.message);
        const oraSign = ora('Signing Posts...').start();

        // sign posts that were retrieved
        const signPromise: Promise<DataResponse>[] = [];
        const crawledFeeds = resp.items.filter(i => i.success).map(i => i.data);
        crawledFeeds.forEach(f => {
            const {config, posts} = f;
            signPromise.push(signCrawledPosts(config, false, posts));
        });
        const signResp = await Promise.all(signPromise);

        // get all signed posts
        const signedPosts: {
            jws: Static<typeof JwsPost>;
            hash: string;
        }[] = [];
        signResp.filter(r => r.success).forEach(r => signedPosts.push(...r.data));

        oraSign.succeed(`${signedPosts.length} Posts Signed`)
        const oraPut = ora('Publishing Posts...').start();

        // publish all posts async with concurrent limiting
        const pc: PutConfig = {
            hash: '',
            broadcaster: flags.broadcasters || '',
            selfSigned: env.ALLOW_SELF_SIGNED === 'true',
        }
        const pubResp = await putMultiplePosts(signedPosts, pc, crawlLgr);

        // calculate and log out success
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
    }
}
