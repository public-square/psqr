import { Command, flags, run as runCommand } from '@oclif/command'
import { getVars } from '../../functions/env';

import { FeedList, crawlFeeds, assembleCrawlConfigs, crawlTypes, CrawlType } from '../../functions/crawl'
import { ProxyConfig } from '../../types/interfaces';
import { createFiles, FileConfig } from '../../functions/utility';
import { parseBareDid } from '../../functions/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Runs a test crawl to verify if the information gathered is accurate.
 */
export default class CrawlTest extends Command {
    static description = `Run a test Crawl to verify the information gathered is accurate.
Output normally includes post.info.publicSquare.package only as json array.
Output is saved as a local file(s) with the name crawl-test-{ level }-{ path valid did}-{ timestamp }.json(l) depending on options selected.`

    static flags = {
        help: flags.help({ char: 'h' }),
        proxy: flags.boolean({ char: 'p', default: false, description: 'Use a proxy for each request' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as a list of newline separated DIDs. They are assumed to all be the same type.' }),
        urlOnly: flags.boolean({ char: 'u', default: false, description: 'Only output list of canonicalUrls.' }),
        dataOnly: flags.boolean({ char: 'd', default: false, description: 'Only output source data used to form posts.' }),
        complete: flags.boolean({ char: 'c', default: false, description: 'Include complete post json instead of just meta info.' }),
        list: flags.boolean({ char: 'l', default: false, description: 'Output as a jsonl file instead of a human readable json array.' }),
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
        const { flags, args } = this.parse(CrawlTest)
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

        // determine test level
        let testLevel = 3;
        switch (true) {
            case flags.complete:
                testLevel = 4;
                break;
            case flags.dataOnly:
                testLevel = 2;
                break;
            case flags.urlOnly:
                testLevel = 1;
                break;
        }

        oraConfigs.succeed('Configs found');
        const oraCreate = ora(`Getting test data for level ${testLevel} ...`).start();

        // crawl feeds and get posts
        const resp = await crawlFeeds(configs, false, proxy, testLevel);
        if (resp.success === false) {
            oraCreate.fail(resp.message);
            return false;
        }

        oraCreate.succeed(resp.message);
        const oraSave = ora('Saving Post Test Data Locally...').start();

        // create file configs for each did
        const files: FileConfig[] = [];
        for (let i = 0; i < resp.items.length; i++) {
            const configData = resp.items[i].data;

            // set up test data
            let fileData: string | string[] = flags.list ? '' : [];
            for (let j = 0; j < configData.posts.length; j++) {
                let data = configData.posts[j];

                // if showing only meta info remove everything else
                if (testLevel === 3) {
                    data = data.info.publicSquare.package;
                }

                // add data as single line, unless it should be readable
                if (flags.list || typeof fileData === 'string') {
                    fileData += JSON.stringify(data) + '\n';
                } else {
                    fileData.push(data);
                }
            }

            // assemble path
            const bdid = parseBareDid(configData.config.kid);
            const validDid = bdid === false ? configData.config.kid.replace(/[:/]/g, '-') : bdid.replace(/[:/]/g, '-');
            const extension = flags.list ? 'jsonl' : 'json';
            const path = `crawl-test-${testLevel}-${validDid}-${Date.now()}.${extension}`;

            const data = flags.list ? fileData : JSON.stringify(fileData, null, 4);
            files.push({
                path: path,
                relative: true,
                data: data,
            });
        }

        // create post files
        const postFile = await createFiles(files);

        if (postFile.success) {
            oraSave.succeed(`${postFile.message}\nGenerated crawl:test data: \n ${JSON.stringify(postFile.files, null, 4)}`);
        } else {
            oraSave.fail(postFile.message);
        }
    }
}
