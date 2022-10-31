import { writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'fs';

import { Static } from 'runtypes';
import Sitemapper, { SitemapperOptions } from '@public-square/sitemapper';

import { setVars, getVars } from './env';
import { DataResponse, ListResponse, ProxyConfig } from '../types/interfaces';
import { RSS, Sitemap, Twitter, Webhose } from '../types/crawl';
import { handleRuntypeFail, retrieveFiles, deleteFiles, FileConfig, FileResponse, createFiles, generateLogger, retrieveRegFiles, getRedirectUrl, convertSinceToTimestamp, concurrentPromises } from './utility';
import { Identity } from '../types/identity';
import { Post, PostSkeleton } from '../types/post';
import { createJWS, createPost, createUrlPost } from './post';
import { getIdentity, getKeyPair, parseBareDid } from './identity';
import { CrawlFilters } from '../types/base-types';

const homedir = require('os').homedir();
const RSSParser = require('rss-parser');
const axios = require('axios').default;
const proxyAgent = require('https-proxy-agent');
const readLastLines = require('read-last-lines');

const ogs = require('open-graph-scraper');

const BASE_PATH = `${homedir}/.config/psqr/crawl`;

/** Crawler Logger */
export const crawlLgr = generateLogger(`${BASE_PATH}/log`);

/** Crawler Base Types */
export type CrawlType = 'rss' | 'twitter' | 'webhose' | 'sitemap';

/** Crawler Types List */
export const crawlTypes: CrawlType[] = [
    'rss',
    'twitter',
    'webhose',
    'sitemap',
]

/** Crawler Variables */
export enum CrawlVars {
    rss = 'DEFAULT_RSS',
    twitter = 'DEFAULT_TWITTER',
    webhose = 'DEFAULT_WEBHOSE',
    sitemap = 'DEFAULT_SITEMAP'
}

enum DefaultLimits {
    twitter = 5,
    rss = 5,
    webhose = 5,
    sitemap = 5
}

/** Crawler Configuration */
export type CrawlConfig = Static<typeof RSS> | Static<typeof Twitter> | Static<typeof Webhose> | Static<typeof Sitemap>;

/** Crawler Finalized Feed List */
export interface FeedList {
    rss?: string[];
    twitter?: string[];
    webhose?: string[];
    sitemap?: string[];
}

/** Sitemap Options */
export interface SitemapOptions {
    lastmod: number;
    include?: string;
    exclude?: string;
}

/**
 * Check if a string is a valid crawl type.
 *
 * @param type value to check
 * @returns boolean result
 */
function typeCheck(type: CrawlType): boolean {
    return crawlTypes.includes(type);
}

/**
 * Get the crawler configurations for the specified crawlers.
 * If dids parameter is skipped or false, return current default configurations.
 * If dids is true, return all available configs.
 *
 * @param type lowercase Crawl type config
 * @param dids comma separated list of crawl dids
 * @returns Success or Failure Message Response including an array of the configs
 */
async function getCrawlConfig(type: CrawlType, dids: string | boolean = false): Promise<DataResponse> {
    if (!typeCheck(type)) return { success: false, message: 'Invalid Crawl type' }
    const EVAR = CrawlVars[type];
    const PATH = BASE_PATH;

    // if dids is false, get defaults
    if (dids === false) {
        const resp = getVars(EVAR);
        const rvar = resp[EVAR];
        if (typeof rvar === 'undefined' || rvar === '') {
            return {
                success: false,
                message: `No dids passed and no default for ${type} found`,
            }
        }
        dids = rvar;
    }

    try {
        let idAr: string[];

        // if dids is true, get all possible configs
        if (dids === true) {
            const resp = readdirSync(PATH);
            if (resp.length === 0) {
                return { success: false, message: `No ${type} configs present` }
            }
            idAr = resp;
        } else {
            idAr = dids.split(',');
        }

        // make file request array
        const files: FileConfig[] = idAr.map(i => {
            const did = parseBareDid(i);
            if (did === false) return { path: '', relative: false };

            const config = {
                path: `${PATH}/${did.replace(/:/g, '-')}/config.${type}.json`,
                relative: false,
            }
            return config;
        });

        // retrieve files and handle response
        const resp = await retrieveFiles(files);
        if (resp.success === false) return { success: false, message: resp.message }

        // extract configs and respond with success
        const configs = resp.files.map(f => {
            if (typeof f === 'object' && typeof f.data === 'string') {
                return JSON.parse(f.data)
            }

            return null;
        });
        return {
            success: true,
            message: `Successfully retrieved all ${type} configs`,
            data: configs,
        };
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Assemble all Crawler Configurations for those specified.
 * If no feeds are specified, defaults will be used,
 * unless the noDefaults param is set to True.
 *
 * @param feeds list of feed dids separated by type
 * @param noDefaults don't use defaults if list of dids is empty
 * @returns array containing configs, empty if none
 */
async function assembleCrawlConfigs(feeds: FeedList = {}, noDefaults = false): Promise<CrawlConfig[]> {
    // if no feeds specified, use defaults
    const configs: CrawlConfig[] = [];

    for (let i = 0; i < crawlTypes.length; i++) {
        const type = crawlTypes[i];
        const dids = feeds[type];

        let resp;
        if (dids !== undefined && dids.length !== 0) {
            const idStr = dids.join(',')
            resp = await getCrawlConfig(type, idStr);
        } else if (noDefaults === false) {
            resp = await getCrawlConfig(type);
        } else {
            continue;
        }

        // include successful configs
        if (resp.success) {
            configs.push(...resp.data);
        }
    }

    return configs
}

/**
 * Remove specified crawlers completely.
 * If a specified crawl is a default, it will be removed
 * from the list of defaults.
 *
 * @param type lowercase Crawl type config
 * @param dids comma separated list of crawl dids
 * @returns Success or Failure Message Response including an array of the files deleted
 */
async function removeCrawl(type: CrawlType, dids: string): Promise<DataResponse> {
    if (!typeCheck(type)) return { success: false, message: 'Invalid Crawl type' }

    // remove any dids that don't have available configs
    const avail = readdirSync(BASE_PATH);
    const pathAr: string[] = [];
    const idAr: string[] = [];
    const didAr = dids.split(',');
    for (let i = 0; i < didAr.length; i++) {
        const did = didAr[i];
        const path = crawlPath(did);

        if (avail.indexOf(did.replace(/:/g, '-')) !== -1) {
            pathAr.push(path);
            idAr.push(did);
        }
    }

    // ensure there are dids left to remove
    if (pathAr.length === 0) return { success: false, message: `No ${type} Configs available to remove` }

    try {
        // remove any defaults
        const defResp = getDefaultCrawl(type);
        if (defResp.success) {
            const def: string[] = defResp.data;
            const newDef = def.filter(i => idAr.indexOf(i) === -1).join(',');

            const set = setDefaultCrawl(type, newDef, true);
            if (set.success === false) {
                // Fix up Logic Here
                console.log(JSON.stringify({ success: false, message: `Unable to remove default ${type}(s): ${set.message}` }));
            }
        }

        // make crawl dir request array
        const files: FileConfig[] = pathAr.map(p => {
            const config = {
                path: `${p}/config.${type}.json`,
                relative: false,
            }
            return config;
        });

        // send request and pass on response
        const resp = await deleteFiles(files);
        return resp;
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }
}

/**
 * Set the defaults for a specified crawler.
 * Unless indicated otherwise,
 * specified dids will be added to current default list.
 *
 * @param type lowercase Crawl type config
 * @param dids comma separated list of crawl dids
 * @param overwrite should the list of dids completely overwrite current defaults
 * @returns Success or Failure Message Response including the current defaults
 */
function setDefaultCrawl(type: CrawlType, dids: string, overwrite = false): DataResponse {
    if (!typeCheck(type)) return { success: false, message: 'Invalid Crawl type' }
    const EVAR = CrawlVars[type];
    const PATH = BASE_PATH;
    const limit = DefaultLimits[type];

    let msg = '';
    let defaults = dids.split(',');

    // skip getting current value if just overwriting
    if (overwrite === false) {
        const oldVal = getVars(EVAR);
        const ovar = oldVal[EVAR];
        if (typeof ovar !== 'undefined' && ovar !== '') defaults = [...ovar.split(','), ...defaults];
    }

    // enforce did name restrictions
    // defaults = defaults.filter(i => {
    //     const test = /^[\w-]+$/.test(i);
    //     if (test === false) msg += `\nRemoved did ${i} due to invalid characters (must match /\\w\\-/).`
    //     return test;
    // })

    // ensure there are defaults left to add
    // if (defaults.length === 0) return { success: false, message: 'All Ids provided have invalid characters (must match /\\w\\-/).' }

    // remove any dids that don't have available configs
    for (let i = 0; i < defaults.length; i++) {
        const def = defaults[i];
        const path = def.replace(/:/g, '-');

        if (existsSync(`${PATH}/${path}/config.${type}.json`) === false) {
            msg += `\nRemoved did ${def} due to no available config.`
            defaults.splice(i, 1);
        }
    }

    // ensure there are defaults left to add
    if (defaults.length === 0) return { success: false, message: `No Dids provided have available configs. Use crawl:add:${type.toLowerCase()} to make one.` }

    // remove any duplicate ids and enforce limits
    defaults = [...new Set(defaults)];
    const defCount = defaults.length;
    defaults = defaults.slice(0, limit);

    // indicate that some defaults were not included if over limit
    if (defCount !== defaults.length) msg += `\nSome defaults were not included because they went over the ${type} limit of ${limit}.`

    // combine defaults into new value
    const newVal = defaults.join(',');

    // send request and handle response
    const set = setVars(`${EVAR}=${newVal}`);
    if (set === {}) {
        return { success: false, message: `Unable to set default ${type}(s)` };
    }
    return { success: true, message: `Set default ${type}(s) to ${set[EVAR]}` + msg };
}

/**
 * Get an array of the default DIDs for a specified crawler.
 *
 * @param type lowercase Crawl type
 * @returns Success or Failure Message Response including an array of the default DIDs
 */
function getDefaultCrawl(type: CrawlType): DataResponse {
    if (!typeCheck(type)) return { success: false, message: 'Invalid Crawl type' }
    const EVAR = CrawlVars[type];
    const resp = getVars(EVAR);
    const rvar = resp[EVAR];

    // if default var for specified crawl doesn't exist or is empty
    if (typeof rvar === 'undefined' || rvar === '') {
        return {
            success: false,
            message: `No defaults for ${type} found`,
            data: [],
        }
    }

    // parse list and return
    return {
        success: true,
        message: `Defaults for ${type} found`,
        data: rvar.split(','),
    }
}

/**
 * Retrieve all posts stored by the crawler and sign them.
 * Default behavior is to store the newly signed posts with the originals,
 * but that can be overridden with the store param.
 *
 * @param config config of Crawl
 * @param store should the signed posts be stored
 * @param posts array of posts
 * @returns Success or Failure Message Response including an array of the signed posts and their hashes
 */
async function signCrawledPosts(config: CrawlConfig, store = true, posts: Static<typeof Post>[] = []): Promise<DataResponse> {
    const PATH = crawlPath(config.kid);

    // setup logging
    const logFile = `${PATH}/log`;
    const lgr = generateLogger(logFile);
    lgr('Signing crawled posts', true);

    // if no posts have been passed, check post dir
    const dir = `${PATH}/posts`;
    if (posts.length === 0) {
        // assemble expected post root dir, regex, and file config
        const reg = /.+\.json$/m
        const fc: FileConfig = {
            path: dir,
            relative: false,
        }

        // retrieve all post files
        const fResp = await retrieveRegFiles(reg, fc)
        if (fResp.success === false) {
            const message = 'Unable to retrieve posts because: ' + fResp.message;
            lgr(message);
            return { success: false, message };
        }

        posts.push(...fResp.files.map(f => {
            if (typeof f === 'object' && typeof f.data === 'string') {
                return JSON.parse(f.data)
            }

            return null;
        }));
    }

    // ensure there are some posts to sign
    if (posts.length === 0) {
        const message = 'No posts found to sign';
        lgr(message);
        return { success: false, message };
    }

    // get keyPair object
    const kid = config.kid || '';
    const kpResp = await getKeyPair(kid);
    if (kpResp.success === false) return { success: false, message: kpResp.message };
    const keyPair = kpResp.keyPairs[0];

    // validate and sign files
    const jwsPromise: Promise<DataResponse>[] = [];
    posts.forEach(p => jwsPromise.push(createJWS(JSON.stringify(p), keyPair)));
    const jwsResp = await Promise.all(jwsPromise);

    // log signing failures
    jwsResp.filter(r => !r.success).forEach(r => lgr(r.message));

    // filter out posts that failed for whatever reason and return
    const signedPosts = jwsResp.filter(r => r.success).map(r => r.data);
    let msg = `${posts.length} posts found, ${signedPosts.length} posts signed`;

    // ensure there were some successful posts
    if (signedPosts.length === 0) {
        const message = 'Post Signing failed: ' + msg;
        lgr(message);
        return { success: false, message }
    }

    // store signed posts if requested
    if (store) {
        lgr('Storing signed files');
        const spConfig: FileConfig[] = signedPosts.map(p => {
            return {
                path: dir + p.hash + '.jws',
                relative: false,
                data: p.jws,
            }
        })

        const spResp = await createFiles(spConfig, lgr);
        const outcome = spResp.success ? `, ${spResp.files.length} Signed posts stored` : ', unable to store Signed posts';
        msg += outcome;
    }

    // finally return signed posts
    lgr(msg);
    return {
        success: true,
        message: msg,
        data: signedPosts,
    }
}

/**
 * Remove all posts (signed or otherwise) from
 * specified crawlers completely.
 *
 * @param did did of crawl to delete posts from
 * @param postHashes list of hashes of posts to remove
 * @returns Success or Failure Message Response including an array of the files deleted
 */
async function removeCrawledPosts(did: string, postHashes: string[]): Promise<FileResponse> {
    const PATH = crawlPath(did)

    // setup logging
    const logFile = `${PATH}/log`;
    const lgr = generateLogger(logFile);
    lgr('Deleting stored posts', true)

    // assemble expected posts
    const fcs = [];
    for (let index = 0; index < postHashes.length; index++) {
        const hash = postHashes[index];

        fcs.push({
            path: `${PATH}/posts/post-${hash}.json`,
            relative: false,
        })
    }

    // delete all posts
    const resp = await deleteFiles(fcs, lgr);
    return resp;
}

/**
 * Crawl specified feeds and return new posts.
 * @param configs array of crawl configs to use
 * @param store should the posts be stored
 * @param proxyConfig config object for proxy service to use
 * @param testLevel 0-4 indicating what test data should be returned, 0 is normal
 * @returns Success or Failure Message Response including list of new posts
 */
async function crawlFeeds(configs: CrawlConfig[], store = false, proxyConfig: ProxyConfig = false, testLevel = 0): Promise<ListResponse> {
    const items: DataResponse[] = [];

    // ensure there are configs to use
    if (configs.length === 0) return { success: false, message: 'No configs available', items }

    // iterate through config list and get posts
    for (let i = 0; i < configs.length; i++) {
        const c = configs[i];
        const iPath = crawlPath(c.kid);

        // setup logging
        const logFile = `${iPath}/log`;
        const lgr = generateLogger(logFile);
        lgr(`Beginning ${testLevel > 0 ? 'test level ' + testLevel + ' ' : ''}crawl`, true);

        // get config identity
        const idResp = await getIdentity(c.kid);
        if (idResp.success === false) {
            lgr('Unable to retrieve identity because: ' + idResp.message)
            continue;
        }
        const identity = idResp.identity;

        // get posts
        let pResp: DataResponse;
        lgr(`Getting new posts from ${c.type} feed: ${c.kid}`);
        switch (c.type) {
            case 'rss':
                pResp = await getRSSPosts(c, identity, lgr, proxyConfig, testLevel)
                break;
            case 'twitter':
                pResp = await getTwitterPosts(c, identity, lgr, proxyConfig, testLevel)
                break;
            case 'webhose':
                pResp = await getWebhosePosts(c, identity, lgr, proxyConfig, testLevel)
                break;
            case 'sitemap':
                pResp = await getSitemapPosts(c, identity, lgr, proxyConfig, testLevel)
                break;
        }

        // ensure we have posts to use
        if (pResp.success === false || pResp.data?.posts?.length === 0) {
            const msg = 'No valid posts found because: ' + pResp.message;
            lgr(msg);
            items.push({
                success: false,
                message: msg,
                data: { config: c, posts: [] },
            })
            continue;
        }

        // if testing return data unmodified
        if (testLevel > 0) {
            const msg = `Returning data immediately for test level ${testLevel}`
            lgr(msg);
            items.push({
                success: true,
                message: msg,
                data: {
                    config: c,
                    posts: pResp.data?.posts,
                },
            });
            continue;
        }

        let posts = pResp.data.posts;

        // get list of hashes and find where the last item crawled is
        const hashes = posts.map((p: Static<typeof Post>) => p.infoHash);
        const crawlPoint = hashes.indexOf(c.lastPost);

        // if necessary, prune list of items that have already been crawled
        if (crawlPoint !== -1) {
            posts = posts.slice(crawlPoint + 1);
        }

        // ensure there are posts left
        if (posts.length === 0) {
            const msg = 'No new posts found';
            lgr(msg);
            items.push({
                success: false,
                message: msg,
                data: { config: c, posts: [] },
            })
            continue;
        }

        // add posts
        const msg = `Found ${posts.length} posts`;
        lgr(msg);
        items.push({
            success: true,
            message: msg,
            data: {
                config: c,
                posts: [...posts],
            },
        });

        // store posts if requested
        if (store) {
            lgr(`Storing ${posts.length} posts`)
            const files = posts.map((p: Static<typeof Post>) => {
                const path = `${iPath}/posts/post-${p.infoHash}.json`
                return {
                    path,
                    relative: false,
                    data: JSON.stringify(p),
                }
            })
            await createFiles(files, lgr);
        }

        // update config with new values
        c.lastPost = posts[posts.length - 1].infoHash;
        lgr(`New lastPost: ${c.lastPost}`)
        switch (c.type) {
            case 'rss': {
                c.etag = pResp.data.etag;
                lgr(`New etag: ${c.etag}`)

                // update config
                const rc = writeRSSCrawl(c);
                if (rc.success === false) return { ...rc, items };
                break;
            }
            case 'twitter': {
                c.lastTweet = pResp.data.tweet;
                lgr(`New lastTweet: ${c.lastTweet}`)

                // update config
                const tc = await writeTwitterCrawl(c);
                if (tc.success === false) return { ...tc, items };
                break;
            }
            case 'webhose': {
                // update config
                const wc = writeWebhoseCrawl(c);
                if (wc.success === false) return { ...wc, items };
                break;
            }
            case 'sitemap': {
                // update config
                const sc = writeSitemapCrawl(c);
                if (sc.success === false) return { ...sc, items };
                break;
            }
        }
        lgr('Config updated')
    }

    // get total posts
    let postCount = 0;
    items.forEach(i => {
        postCount += i.data.posts.length;
    });

    // ensure there are some posts
    if (postCount === 0) return { success: false, message: 'No posts found', items }

    return {
        success: true,
        message: `Got ${postCount} new posts from feeds`,
        items,
    }
}

/**
 * Create a RSS configuration.
 * This configuration can be used to overwrite current config.
 *
 * @param config RSS config
 * @returns Success or Failure Message Response
 */
function writeRSSCrawl(config: Static<typeof RSS>): DataResponse {
    const did = parseBareDid(config.kid);
    if (did === false) return { success: false, message: 'Unable to parse kid, expected format did:(psqr|web):{hostname}(/|:){path}#{keyId}' };

    // set rss path and ensure it exists
    const RSS_PATH = crawlPath(did);
    if (existsSync(RSS_PATH) === false) mkdirSync(RSS_PATH, { recursive: true });

    try {
        // validate config and then write to file
        RSS.check(config);
        writeFileSync(`${RSS_PATH}/config.rss.json`, JSON.stringify(config))
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: `Successfully wrote RSS config: ${RSS_PATH}`,
    }
}

/**
 * Create a Twitter configuration.
 * This configuration can be used to overwrite current config.
 *
 * @param config Twitter config
 * @returns Success or Failure Message Response
 */
async function writeTwitterCrawl(config: Static<typeof Twitter>): Promise<DataResponse> {
    const did = parseBareDid(config.kid);
    if (did === false) return { success: false, message: 'Unable to parse kid, expected format did:(psqr|web):{hostname}(/|:){path}#{keyId}' };

    // set twitter path and ensure it exists
    const TWITTER_PATH = crawlPath(did);
    if (existsSync(TWITTER_PATH) === false) mkdirSync(TWITTER_PATH, { recursive: true });

    try {
        // validate config
        Twitter.check(config);

        // get id if 0
        if (config.userId === 0) {
            // get guest token
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.' +
                `${Math.floor(Math.random() * 9999)} Safari/537.${Math.floor(Math.random() * 99)}`;
            const gt = await getTwitterGuestToken(config.username, ua);
            if (gt === '') return { success: false, message: 'Unable to get guest token' };

            const resp = await searchTwitter(config.username, gt, ua);
            if (resp.success === false) return resp;

            // filter to just the username
            let userId = 0;
            const users = resp.data.globalObjects.users;
            for (const user in users) {
                if (Object.prototype.hasOwnProperty.call(users, user)) {
                    const u = users[user];

                    // if screen_name matches username it's our user
                    if (u.screen_name === config.username) {
                        userId = u.id;
                        break;
                    }
                }
            }

            if (userId === 0) return {
                success: false,
                message: 'Unable to find a Twitter id for username: ' + config.username,
            };

            config.userId = userId;
        }

        writeFileSync(`${TWITTER_PATH}/config.twitter.json`, JSON.stringify(config))
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: `Successfully wrote Twitter config: ${TWITTER_PATH}`,
    }
}

/**
 * Create a Webhose configuration.
 * This configuration can be used to overwrite current config.
 *
 * @param config Webhose config
 * @returns Success or Failure Message Response
 */
function writeWebhoseCrawl(config: Static<typeof Webhose>): DataResponse {
    const did = parseBareDid(config.kid);
    if (did === false) return { success: false, message: 'Unable to parse kid, expected format did:(psqr|web):{hostname}(/|:){path}#{keyId}' };

    // set webhose path and ensure it exists
    const WEBHOSE_PATH = crawlPath(did);
    if (existsSync(WEBHOSE_PATH) === false) mkdirSync(WEBHOSE_PATH, { recursive: true });

    try {
        // validate config and then write to file
        Webhose.check(config);
        writeFileSync(`${WEBHOSE_PATH}/config.webhose.json`, JSON.stringify(config))
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: `Successfully wrote Webhose config: ${WEBHOSE_PATH}`,
    }
}

/**
 * Create a Sitemap configuration.
 * This configuration can be used to overwrite current config.
 *
 * @param config Sitemap config
 * @returns Success or Failure Message Response
 */
function writeSitemapCrawl(config: Static<typeof Sitemap>): DataResponse {
    const did = parseBareDid(config.kid);
    if (did === false) return { success: false, message: 'Unable to parse kid, expected format did:(psqr|web):{hostname}(/|:){path}#{keyId}' };

    // set sitemap path and ensure it exists
    const SITEMAP_PATH = crawlPath(did);
    if (existsSync(SITEMAP_PATH) === false) mkdirSync(SITEMAP_PATH, { recursive: true });

    try {
        // validate config and then write to file
        Sitemap.check(config);
        writeFileSync(`${SITEMAP_PATH}/config.sitemap.json`, JSON.stringify(config))
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: `Successfully wrote Sitemap config: ${SITEMAP_PATH}`,
    }
}

/**
 * Query a Webhose feed and return an ordered list of posts
 * from the returned feed items.
 *
 * @param config Webhose crawl config
 * @param identity identity to use when creating posts
 * @param lgr logger function
 * @param proxyConfig config object for proxy service to use
 * @param testLevel 0-4 indicating what test data should be returned, 0 is normal
 * @returns Success or Failure Message Response with ordered list of posts
 */
async function getWebhosePosts(config: Static<typeof Webhose>, identity: Static<typeof Identity>, lgr: Function = () => { /* no log */ }, proxyConfig: ProxyConfig = false, testLevel = 0): Promise<DataResponse> {
    let url = config.url;
    const env = getVars();

    url += '&token=' + env.WEBHOSE_TOKEN;

    const axConfig: any = {}

    // add proxy if necessary
    if (proxyConfig !== false) {
        axConfig.httpsAgent = new proxyAgent(proxyConfig);
    }

    let resp;

    try {
        resp = await axios.get(url, axConfig);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // filter posts to remove dupes
    const history = await getCrawlHistory(config.kid, false);
    lgr(`${resp.data.posts.length} Webhose posts retrieved`)
    const postLinks = [];
    for (let ii = 0; ii < resp.data.posts.length; ii++) {
        const post = resp.data.posts[ii];
        postLinks.push(post.url);
    }
    const filteredUrls = await filterCrawlUrls(postLinks, config.filters?.crawl, history, proxyConfig);
    const filteredPosts = [];
    for (let jj = 0; jj < resp.data.posts.length; jj++) {
        const post = resp.data.posts[jj];

        // include post if it passed the filter
        if (filteredUrls.indexOf(post.url) === -1) {
            filteredPosts.push(post);
        }
    }
    resp.data.posts = filteredPosts;
    lgr(`${resp.data.posts.length} Webhose posts passed the filter`)

    // if requested return only urls (level 1)
    if (testLevel === 1) {
        const posts: any[] = [];
        const testResp = {
            success: true,
            message: 'Retrieved urls',
            data: {
                posts: posts,
            },
        };

        for (let i = 0; i < resp.data.posts.length; i++) {
            const post = resp.data.posts[i];
            testResp.data.posts.push(post.url);
        }

        return testResp;
    }

    const feed: any[] = resp.data.posts;

    // iterate through feed items to make posts
    const posts: Promise<DataResponse>[] = [];
    lgr(`Generating posts from ${feed.length} feed items`);
    for (let i = 0; i < feed.length; i++) {
        const item = feed[i];

        if (item.url.startsWith('http://') === true) {
            continue;
        }

        // assemble post skeleton
        let ogsData;
        let skeleton;

        // ogs
        const options = {
            url: item.url,
            onlyGetOpenGraphInfo: true,
            ogImageFallback: false,
        };

        try {
            ogsData = await ogs(options);
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            console.log(msg);
            continue;
        }

        // if requested only return source data (level 2)
        if (testLevel === 2) {
            const srcData = {
                success: true,
                message: 'Source Data',
                data: {
                    ogsData: ogsData.result,
                    webhoseData: item,
                },
            }

            posts.push(new Promise(resolve => resolve(srcData)));
            continue;
        }

        try {
            skeleton = PostSkeleton.check({
                body: item.text,
                description: typeof ogsData.result.ogDescription !== 'undefined' && ogsData.result.ogDescription ? ogsData.result.ogDescription : '',
                lang: '',
                publishDate: new Date(item.published).getTime() || Date.now(),
                // publishDate: item['published'],
                title: typeof ogsData.result.ogTitle !== 'undefined' && ogsData.result.ogTitle ? ogsData.result.ogTitle : item.title,
                geo: '',
                politicalSubdivision: '',
                image: typeof ogsData.result.ogImage !== 'undefined' && ogsData.result.ogImage ? ogsData.result.ogImage.url : item.thread.main_image || item.thread.main_image > 0 ? item.thread.main_image : '',
                canonicalUrl: typeof ogsData.result.ogUrl !== 'undefined' && ogsData.result.ogUrl ? ogsData.result.ogUrl : item.url,
            });
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            console.log(msg);
            return { success: false, message: msg }
        }

        // generate post creation promise and add to list
        const pp = createPost(skeleton, identity);
        posts.push(pp);
    }

    // once all promises are returned, return ordered list of posts
    return Promise.allSettled(posts)
        .then(values => {
            // skip filtering if test level 2
            let posts = [];
            if (testLevel === 2) {
                for (let j = 0; j < values.length; j++) {
                    const v = values[j];

                    if (v.status === 'fulfilled') {
                        posts.push(v.value.data);
                    }
                }
            } else {
                // get posts only and then sorted by publishDate
                const processedValues = [];
                for (let k = 0; k < values.length; k++) {
                    const v = values[k];

                    if (v.status === 'fulfilled') {
                        processedValues.push(v.value.data)
                    }
                }
                posts = processedValues.sort((a, b) => {
                    if (a.info.publicSquare.package.publishDate > b.info.publicSquare.package.publishDate) {
                        return 1 // use b first
                    }
                    return -1 // use a first
                });

                // update history if not testing
                if (testLevel === 0) {
                    for (let j = 0; j < posts.length; j++) {
                        const post = posts[j];

                        const canon = post.info.publicSquare.package.canonicalUrl;
                        updateCrawlHistory(post.infoHash, canon, config.kid, 'webhose');
                    }
                }
            }

            const message = `Successfully got all (${posts.length}) WebHose posts from feed`;
            lgr(message);
            return {
                success: true,
                message,
                data: {
                    posts,
                },
            }
        })
}

/**
 * Query an RSS feed and return an ordered list of posts
 * from the feed items. This supports the RSS
 * Substack generator.
 *
 * @param config RSS crawl config
 * @param identity identity to use when creating posts
 * @param lgr logger function
 * @param proxyConfig config object for proxy service to use
 * @param testLevel 0-4 indicating what test data should be returned, 0 is normal
 * @returns Success or Failure Message Response with ordered list of posts
 */
async function getRSSPosts(config: Static<typeof RSS>, identity: Static<typeof Identity>, lgr: Function = () => { /* no log */ }, proxyConfig: ProxyConfig = false, testLevel = 0): Promise<DataResponse> {
    let feed;
    let newEtag: string | false;

    const etag = config.etag;
    const url = config.url;
    try {
        // get feed data using etag
        lgr('Getting feed data')
        const config: any = {
            headers: { 'If-None-Match': etag },
        }

        // add proxy if necessary
        if (proxyConfig !== false) {
            config.httpsAgent = new proxyAgent(proxyConfig);
        }

        const fResp = await axios.get(url, config);
        newEtag = fResp.headers.etag || false;
        const rss = fResp.data;

        // parse response
        lgr('Parsing feed data')
        const rp = new RSSParser();
        feed = await rp.parseString(rss);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // ensure there is data to parse
    if (feed === null || feed.items.length === 0) {
        const message = 'No data in Feed to get';
        lgr(message);
        return {
            success: false,
            message,
        }
    }

    // warn if this is not a substack feed
    if (feed.generator !== 'Substack') {
        const message = 'Feed was not generated using Substack, attempting to proceed anyways';
        lgr(message);
    }

    // filter feed items to remove dupes
    const history = await getCrawlHistory(config.kid, false);
    lgr(`${feed.items.length} RSS posts retrieved`)
    const feedLinks = [];
    for (let ii = 0; ii < feed.items.length; ii++) {
        const post = feed.items[ii];
        feedLinks.push(post.link);
    }
    const filteredUrls = await filterCrawlUrls(feedLinks, config.filters?.crawl, history, proxyConfig);
    lgr(`${filteredUrls.length} RSS posts passed the filter`)

    // if requested return only urls (level 1)
    if (testLevel === 1) {
        const testResp = {
            success: true,
            message: 'Retrieved urls',
            data: {
                posts: filteredUrls,
            },
        };

        return testResp;
    }

    let posts: DataResponse[] = [];
    try {
        // using filtered urls, create post requests limited to 100 concurrent and wait for them to return
        const poolParams: any[] = [];
        for (let i = 0; i < filteredUrls.length; i++) {
            const u = filteredUrls[i];

            // return only ogs data if requested
            if (testLevel === 2) {
                let ogsData;

                // ogs
                const options: any = {
                    url: u,
                    ogImageFallback: false,
                    customMetaTags: [
                        {
                            multiple: false,
                            property: 'article:published',
                            fieldName: 'articlePublishedTime',
                        },
                        {
                            multiple: false,
                            property: 'article:modified',
                            fieldName: 'articleModifiedTime',
                        },
                    ],
                    timeout: 10000,
                };

                // add proxy if necessary
                if (proxyConfig !== false) {
                    options.agent = new proxyAgent(proxyConfig);
                }

                try {
                    ogsData = await ogs(options);
                } catch (error: any) {
                    console.error(error);
                    continue;
                }

                const srcData = {
                    success: true,
                    message: 'Got source data',
                    data: {
                        url: u,
                        ogsData: ogsData.result,
                    },
                };

                posts.push(srcData);
            } else {
                poolParams.push([
                    u,
                    identity,
                    config.filters?.value,
                ])
            }
        }

        if (testLevel !== 2) {
            posts = await concurrentPromises(poolParams, createUrlPost, 10);
        }
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // finalize post values
    const finalPosts: any[] = [];

    // get sucessful posts only
    lgr(`Validating ${posts.length} posts and updating rss history`);
    for (let j = 0; j < posts.length; j++) {
        const resp = posts[j];

        if (resp.success) {
            // skip filtering if test level 2
            if (testLevel === 2) {
                finalPosts.push(resp.data);
                continue;
            }

            const postData = resp.data;
            const post = postData.post;

            // validate post and update crawl history
            try {
                Post.check(post);

                // update history if not testing
                if (testLevel === 0) {
                    const canon = post.info.publicSquare.package.canonicalUrl;
                    updateCrawlHistory(post.infoHash, canon, config.kid, 'rss');

                    // include originalUrl if not the same as the canonicalUrl
                    if (postData.originalUrl !== canon) {
                        updateCrawlHistory(post.infoHash, postData.originalUrl, config.kid, 'rss');
                    }
                }

                finalPosts.push(post);
            } catch (error: any) {
                const msg = handleRuntypeFail(error);
                lgr(msg);
            }
        }
    }

    const message = `Successfully got all (${posts.length}) RSS posts from feed`;
    lgr(message);
    return {
        success: true,
        message,
        data: {
            etag: newEtag || etag,
            posts: finalPosts,
        },
    }
}

/**
 * Get any new tweets since lastTweet and return them as posts.
 * This does not update the lastTweet property in the config.
 *
 * @param config twitter crawl config
 * @param identity identity object to make posts with
 * @param lgr logger function
 * @param proxyConfig config object for proxy service to use
 * @param testLevel 0-4 indicating what test data should be returned, 0 is normal
 * @returns Success or Failure Message Response including chronological list of tweets as posts
 */
async function getTwitterPosts(config: Static<typeof Twitter>, identity: Static<typeof Identity>, lgr: Function = () => { /* no log */ }, proxyConfig: ProxyConfig = false, testLevel = 0): Promise<DataResponse> {
    // set current config values
    let lastTweet = config.lastTweet;
    const username = config.username;

    // get guest token
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.' +
        `${Math.floor(Math.random() * 9999)} Safari/537.${Math.floor(Math.random() * 99)}`;
    const gt = await getTwitterGuestToken(username, ua, proxyConfig);
    if (gt === '') return { success: false, message: 'Unable to get guest token' };
    lgr(`Retrieved guest token: ${gt}`);

    // using guest token, iterate through tweets until lastTweet or history
    let passed = false;
    let scroll = '';
    let tweets: any[] = [];
    const history = await getCrawlHistory(config.kid, false);
    do {
        lgr(`Searching twitter with scroll: "${scroll}"`)
        const resp = await searchTwitter(username, gt, ua, scroll, proxyConfig);
        if (resp.success === false) return resp;

        let userTweets = [];
        try {
            const retrievedTweets = resp.data.globalObjects.tweets;
            for (const tweet in retrievedTweets) {
                if (Object.prototype.hasOwnProperty.call(retrievedTweets, tweet)) {
                    const twt = retrievedTweets[tweet];

                    // if tweet is from user, keep it
                    if (twt.user_id === config.userId) {
                        userTweets.push(twt);
                        // check to see if tweet is lastTweet
                        if (passed === false && twt.id_str === lastTweet) {
                            passed = true;
                            lgr(`Encountered lastTweet: ${twt.id_str}`);
                        }

                        // check to see if tweet is in history
                        const twtUrl = `https://twitter.com/${config.username}/status/${twt.id_str}`;
                        const hash = history.get(twtUrl)
                        if (passed === false && typeof hash !== 'undefined') {
                            passed = true;
                            lgr(`Encountered tweet from history: ${twtUrl} ${hash}`);
                        }
                    }
                }
            }

            // sort tweets by created date
            userTweets.sort((a, b) => (new Date(a.created_at).getTime() < new Date(b.created_at).getTime()) ? 1 : -1);

            // if lastTweet was passed remove already processed tweets
            if (passed) {
                // get list of ids and find where the last tweet is
                const ids = userTweets.map(t => t.id_str);
                const crawlPoint = ids.indexOf(config.lastTweet);

                // if necessary, prune list of tweets that have already been processed
                if (crawlPoint !== -1) {
                    userTweets = userTweets.slice(0, crawlPoint);
                }
            } else { // no need to get another if passed lastTweet
                // determine scroll value
                let bottom = [];
                const instruct = resp.data.timeline.instructions;
                // if scroll is empty we are starting out
                if (scroll === '') {
                    const entries = instruct[0].addEntries.entries;
                    bottom = entries.filter((e: any) => e.entryId === 'sq-cursor-bottom');
                } else { // if not get next scroll value
                    const replace = instruct.filter((e: any) => Object.prototype.hasOwnProperty.call(e, 'replaceEntry') &&
                        e.replaceEntry.entryIdToReplace === 'sq-cursor-bottom');
                    if (replace.length === 1) bottom.push(replace[0].replaceEntry.entry);
                }

                // if bottom scroll is available, use it
                if (bottom.length === 1) {
                    const nScroll = bottom[0].content.operation.cursor.value;
                    if (nScroll === scroll) {
                        passed = true
                    } else {
                        scroll = nScroll;
                    }
                } else {
                    passed = true
                }
            }
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            return { success: false, message: msg }
        }

        // add new tweets if any are available
        if (userTweets.length > 0) {
            lgr(`Adding ${userTweets.length} new tweets ${userTweets[0].id_str}-${userTweets[userTweets.length - 1].id_str}`)
            tweets.push(...userTweets);
        }
    } while (passed === false);

    // ensure there are some posts to deal with
    if (tweets.length === 0) {
        const message = `No new Tweets found for username: ${username}`;
        lgr(message);
        return {
            success: true,
            message,
            data: {
                tweet: lastTweet,
                posts: [],
            },
        }
    }

    // filter tweets to remove dupes
    lgr(`${tweets.length} Twitter posts retrieved`)
    const tweetLinks = [];
    for (let ii = 0; ii < tweets.length; ii++) {
        const twt = tweets[ii];
        tweetLinks.push(`https://twitter.com/${config.username}/status/${twt.id_str}`);
    }
    const filteredUrls = await filterCrawlUrls(tweetLinks, config.filters?.crawl, history, proxyConfig);
    const filteredTweets = []
    for (let j = 0; j < tweets.length; j++) {
        const twt = tweets[j];
        const url = `https://twitter.com/${config.username}/status/${twt.id_str}`;

        // include tweet if it passed the filter
        if (filteredUrls.indexOf(url) !== -1) {
            filteredTweets.push(twt);
        }
    }
    tweets = filteredTweets;
    lgr(`${tweets.length} tweets passed the filter`)

    // update lastTweet if most recent
    lastTweet = tweets[0].id_str;
    lgr(`New last tweet: ${lastTweet}`);

    // sort tweets so that threads are in the proper order (start to finish)
    lgr('Sorting tweets so that threads are in proper order')
    tweets.sort((a, b) => a.in_reply_to_status_id_str === b.id_str ? 1 : -1);

    // if requested return only urls (level 1)
    if (testLevel === 1) {
        const posts: any[] = [];
        const testResp = {
            success: true,
            message: 'Retrieved urls',
            data: {
                posts: posts,
            },
        };

        for (let i = 0; i < tweets.length; i++) {
            const twt = tweets[i];
            testResp.data.posts.push(`https://twitter.com/${config.username}/status/${twt.id_str}`);
        }

        return testResp;
    }

    // if requested return only source data (level 2)
    if (testLevel === 2) {
        const testResp = {
            success: true,
            message: 'Retrieved source data',
            data: {
                posts: tweets,
            },
        };

        return testResp
    }

    // iterate through tweets to make posts
    const posts = [];
    lgr(`Generating posts from ${tweets.length} tweets`);
    for (let i = 0; i < tweets.length; i++) {
        const twt = tweets[i];

        // assemble post skeleton
        lgr(`Tweet ${twt.id_str}: Generating post skeleton`);
        let skeleton;
        try {
            const image = twt.entities.media === undefined ? config.defaults.image || '' : twt.entities.media[0].media_url_https;

            // get description with full urls
            let description = twt.full_text || '';
            const linkReg = /https?:\/\/t.co\/([a-zA-Z0-9\-.]{8,10})/gm;
            const links = [...description.matchAll(linkReg)];

            // loop through available links and replace them
            lgr(`Tweet ${twt.id_str}: De-referencing t.co links`);
            for (let i = 0; i < links.length; i++) {
                const link = links[i][0];
                lgr(`Tweet ${twt.id_str}: De-referencing link ${link}`);
                const lResp = await getRedirectUrl(link, proxyConfig);

                if (lResp.success) {
                    description = description.replace(link, lResp.data);
                } else {
                    lgr(`Tweet ${twt.id_str}: Failed to de-reference link ${link}`)
                }
            }

            // determine reply field if necessary
            let reply = '';
            lgr(`Tweet ${twt.id_str}: Determining reply field`);
            if (twt.in_reply_to_status_id_str !== null) {
                const link = `https://twitter.com/${twt.in_reply_to_screen_name}/status/${twt.in_reply_to_status_id_str}`
                reply = `twitter:${link}`;

                // if there is a hash that matches, use it
                const replyHash = history.get(link);
                if (replyHash !== null && replyHash !== '') {
                    reply = `psqr:${replyHash}`;
                }
            }

            skeleton = PostSkeleton.check({
                body: '',
                description,
                lang: twt.lang || config.defaults.lang || '',
                publishDate: new Date(twt.created_at).getTime() || Date.now(),
                title: '',
                geo: config.defaults.geo || '',
                politicalSubdivision: config.defaults.politicalSubdivision || '',
                image,
                canonicalUrl: `https://twitter.com/${config.username}/status/${twt.id_str}` || '',
                reply,
            });
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            return { success: false, message: msg }
        }

        // generate post creation promise and add to list
        lgr(`Tweet ${twt.id_str}: Creating post from skeleton`);
        const pp = await createPost(skeleton, identity);
        if (pp.success === false) {
            lgr(pp.message);
            continue;
        }

        // update twitter crawl history and store new post
        const post = pp.data;
        if (testLevel === 0) {
            lgr(`Tweet ${twt.id_str}: Updating post history and storing new post ${post.infoHash}`);
            history.set(post.info.publicSquare.package.canonicalUrl, post.infoHash);
            updateCrawlHistory(post.infoHash, post.info.publicSquare.package.canonicalUrl, config.kid, 'twitter');
        }

        posts.push(post);
    }

    // sort list of posts by publish date
    const finalPosts = posts.sort((a, b) => a.info.publicSquare.package.publishDate > b.info.publicSquare.package.publishDate ? 1 : -1);
    const message = `Successfully got all (${finalPosts.length}) new Tweets for username: ${username}`;
    lgr(message);

    // return all posts
    return {
        success: true,
        message,
        data: {
            tweet: lastTweet,
            posts: finalPosts,
        },
    }
}

/**
 * Access the specified sitemap and return valid urls as posts.
 * Urls are first filtered by the lastmod property and then filtered by
 * their path (if both include and exclude are provided, exclude is ignored).
 *
 * @param config sitemap crawl config
 * @param identity identity object to make posts with
 * @param lgr logger function
 * @param proxyConfig config object for proxy service to use
 * @param testLevel 0-4 indicating what test data should be returned, 0 is normal
 * @returns Success or Failure Message Response including list of valid articles retrieved through the sitemap
 */
async function getSitemapPosts(config: Static<typeof Sitemap>, identity: Static<typeof Identity>, lgr: Function = () => { /* no log */ }, proxyConfig: ProxyConfig = false, testLevel = 0): Promise<DataResponse> {
    // setup sitemapper
    const sitemapOptions: SitemapperOptions = {
        url: config.url,
        timeout: 15000,
    }

    // if lastmod is present and non-zero, use it
    if (config.since !== '' && config.since !== '0') {
        const lastmod = convertSinceToTimestamp(config.since);
        lgr(`Getting urls that have a minimum lastmod value of ${lastmod}`);
        sitemapOptions.lastmod = lastmod;
    }
    const crawlMaps = new Sitemapper(sitemapOptions);

    let posts: DataResponse[] = [];
    const history = await getCrawlHistory(config.kid, false);
    try {
        const { sites, errors } = await crawlMaps.fetch();

        if (errors.length > 0) {
            const message = `Encountered ${errors.length} errors:`
            lgr(message);
            for (let k = 0; k < errors.length; k++) {
                const err = errors[k];
                lgr(err);
            }
        }

        if (sites.length === 0) {
            let message = 'No urls retrieved';
            if (errors.length > 0) message += ' because of errors. Check the log.';

            lgr(message);
            return {
                success: false,
                message,
            }
        }
        lgr(`${sites.length} Sitemap posts retrieved`)

        const filteredUrls = await filterCrawlUrls(sites, config.filters?.crawl, history, proxyConfig);
        if (filteredUrls.length === 0) {
            const message = 'No urls passed filter';
            lgr(message);
            return {
                success: false,
                message,
            }
        }
        lgr(`${filteredUrls.length} urls passed the filter`)

        // if requested return only urls (level 1)
        if (testLevel === 1) {
            const testResp = {
                success: true,
                message: 'Retrieved urls',
                data: {
                    posts: filteredUrls,
                },
            };

            return testResp;
        }

        // using filtered urls, create post requests limited to 100 concurrent and wait for them to return
        const poolParams: any[] = [];
        for (let i = 0; i < filteredUrls.length; i++) {
            const u = filteredUrls[i];

            // return only ogs data if requested
            if (testLevel === 2) {
                let ogsData;

                // ogs
                const options: any = {
                    url: u,
                    ogImageFallback: false,
                    customMetaTags: [
                        {
                            multiple: false,
                            property: 'article:published',
                            fieldName: 'articlePublishedTime',
                        },
                        {
                            multiple: false,
                            property: 'article:modified',
                            fieldName: 'articleModifiedTime',
                        },
                    ],
                    timeout: 10000,
                };

                // add proxy if necessary
                if (proxyConfig !== false) {
                    options.agent = new proxyAgent(proxyConfig);
                }

                try {
                    ogsData = await ogs(options);
                } catch (error: any) {
                    console.error(error);
                    continue;
                }

                const srcData = {
                    success: true,
                    message: 'Got source data',
                    data: {
                        url: u,
                        ogsData: ogsData.result,
                    },
                };

                posts.push(srcData);
            } else {
                poolParams.push([
                    u,
                    identity,
                    config.filters?.value,
                ])
            }
        }

        if (testLevel !== 2) {
            posts = await concurrentPromises(poolParams, createUrlPost, 10);
        }
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // finalize post values
    const finalPosts: any[] = [];

    // get sucessful posts only
    lgr(`Validating ${posts.length} posts and updating sitemap history`);
    for (let j = 0; j < posts.length; j++) {
        const resp = posts[j];

        if (resp.success) {
            // skip filtering if test level 2
            if (testLevel === 2) {
                finalPosts.push(resp.data);
                continue;
            }

            const postData = resp.data;
            const post = postData.post;

            // validate post and update crawl history
            try {
                Post.check(post);

                // update history if not testing
                if (testLevel === 0) {
                    const canon = post.info.publicSquare.package.canonicalUrl;
                    updateCrawlHistory(post.infoHash, canon, config.kid, 'sitemap');

                    // include originalUrl if not the same as the canonicalUrl
                    if (postData.originalUrl !== canon) {
                        updateCrawlHistory(post.infoHash, postData.originalUrl, config.kid, 'sitemap');
                    }
                }

                finalPosts.push(post);
            } catch (error: any) {
                const msg = handleRuntypeFail(error);
                lgr(msg);
            }
        }
    }

    const message = `Successfully got all (${finalPosts.length}) Sitemap posts from sitemap`;
    lgr(message);
    return {
        success: true,
        message,
        data: {
            posts: finalPosts,
        },
    }
}

/**
 * Filter an array of url strings based on provided filters
 * and the post history map. This also strips utm params.
 *
 * @param urls array of urls to filter
 * @param filters filter object with includes and excludes
 * @param history history map containing previous posts
 * @param proxyConfig optional proxy config
 * @returns array of urls that pass the filters
 */
async function filterCrawlUrls(urls: string[], filters: Static<typeof CrawlFilters> = {}, history: Map<string, string>, proxyConfig: ProxyConfig = false): Promise<string[]> {
    let filteredUrls: string[] = [];
    try {
        CrawlFilters.check(filters);
    } catch (error: any) {
        return [];
    }

    // remove utm params and urls in history
    const bareUrls: string[] = []
    for (let k = 0; k < urls.length; k++) {
        const url = new URL(urls[k]);

        // check history before utm removal
        const beforeHash = history.get(urls[k]);
        if (typeof beforeHash !== 'undefined' || url.pathname === '/') {
            continue;
        }

        // loop through params and find ones to remove
        const keysToDelete: string[] = [];
        url.searchParams.forEach((value: string, key: string) => {
            if (/^utm_/i.test(key)) {
                keysToDelete.push(key)
            }
        })

        for (const key of keysToDelete) {
            url.searchParams.delete(key)
        }

        // check history after utm removal
        const afterHash = history.get(url.href);
        if (typeof afterHash !== 'undefined') {
            continue;
        }

        bareUrls.push(url.href)
    }

    // deduplicate urls
    filteredUrls = [...new Set(bareUrls)];

    // perform path filtering
    if (typeof filters.path !== 'undefined') {
        const path = filters.path;
        if (typeof path.includes !== 'undefined' && path.includes.length > 0) {
            const incl = path.includes;
            filteredUrls = filteredUrls.filter(u => incl.some(v => u.includes(v)))
        } else if (typeof path.excludes !== 'undefined' && path.excludes.length > 0) {
            const excl = path.excludes;
            filteredUrls = filteredUrls.filter(u => excl.some(v => u.includes(v)) === false)
        }
    }
    // console.log(`${filteredUrls.length} urls after path filtering`)
    // console.log(`sent out request for ${filteredUrls.length} posts`)
    // send out all body requests with limited concurrency and wait for them to return
    const poolParams: any[] = [];
    for (let j = 0; j < filteredUrls.length; j++) {
        const furl = filteredUrls[j];
        const config: any = {
            url: furl,
            method: 'get',
        };

        // add proxy if necessary
        if (proxyConfig !== false) {
            config.httpsAgent = new proxyAgent(proxyConfig);
        }

        poolParams.push([config])
    }
    const reqs = await concurrentPromises(poolParams, axios, 10);
    // console.log(`received ${reqs.length} responses`);
    // perform markup filtering
    if (typeof filters.markup !== 'undefined') {
        const mark = filters.markup;

        // perform filtering based on markup in body
        if (typeof mark.includes !== 'undefined' && mark.includes.length > 0) {
            const incl = mark.includes;
            filteredUrls = [];

            for (let k = 0; k < reqs.length; k++) {
                const r = reqs[k];

                for (let kk = 0; kk < incl.length; kk++) {
                    const inc = incl[kk];

                    if (r.data.includes(inc)) {
                        filteredUrls.push(r.config.url)
                    }
                }
            }
        } else if (typeof mark.excludes !== 'undefined' && mark.excludes.length > 0) {
            const excl = mark.excludes;

            for (let l = 0; l < reqs.length; l++) {
                const r = reqs[l];

                for (let ll = 0; ll < excl.length; ll++) {
                    const ex = excl[ll];

                    // if present in markup, remove specific item from filteredUrls
                    if (r.data.includes(ex)) {
                        const exlUrl = r.config.url;
                        // console.log(`Removed due to markup: ${exlUrl}`)
                        const index = filteredUrls.indexOf(exlUrl);
                        if (index > -1) {
                            filteredUrls.splice(index, 1);
                        }
                    }
                }
            }
        }
    }
    // console.log(`${filteredUrls.length} urls passed markup filter`)
    // perform redirect duplicate checking
    for (let jj = 0; jj < reqs.length; jj++) {
        const r = reqs[jj];
        const u = r.request.res.responseUrl;
        let remove = false;

        // if response url is different, check history and current list
        if (r.config.url !== u) {
            // check history
            const hash = history.get(u);
            if (typeof hash !== 'undefined') {
                // if present in history, remove specific item from filteredUrls
                remove = true;
            }

            // check if url redirects to one in current list
            const index = filteredUrls.indexOf(u);
            if (index > -1) {
                remove = true;
            }
        }

        // remove if necessary
        if (remove) {
            const index = filteredUrls.indexOf(r.config.url);
            if (index > -1) {
                filteredUrls.splice(index, 1);
            }
        }
    }
    // console.log(`${filteredUrls.length} urls passed redirect dupe check`)
    // perform secondary history filtering on og:url
    for (let m = 0; m < reqs.length; m++) {
        const r = reqs[m];

        const ogsData = await ogs({
            html: r.data,
            onlyGetOpenGraphInfo: true,
            ogImageFallback: false,
        });

        // only check if og:url doesn't match request url
        const u = ogsData.result.ogUrl;
        if (typeof u !== 'undefined' && u !== r.config.url) {
            const hash = history.get(u);
            if (typeof hash !== 'undefined') {
                // if present in history, remove specific item from filteredUrls
                const index = filteredUrls.indexOf(r.config.url);
                if (index > -1) {
                    filteredUrls.splice(index, 1);
                }
            }
        }
    }
    // console.log(`${filteredUrls.length} urls passed filters`)
    return filteredUrls;
}

/**
 * Search for a username on twitter.
 *
 * @param username twitter user username
 * @param gt twitter guest token
 * @param ua current user agent
 * @param scroll page to scroll to
 * @param proxyConfig config object for proxy service to use
 * @returns full twitter api response object
 */
async function searchTwitter(username: string, gt: string, ua: string, scroll = '', proxyConfig: ProxyConfig = false): Promise<DataResponse> {
    const vResp = getVars('TWITTER_TOKEN');
    if (vResp.TWITTER_TOKEN === null || vResp.TWITTER_TOKEN === '') {
        return {
            success: false,
            message: `Unable to retrieve twitter token: ${JSON.stringify(vResp)}`,
        };
    }
    const token = vResp.TWITTER_TOKEN;

    const headers = {
        'User-Agent': ua,
        Authorization: `Bearer ${token}`,
        Referer: `https://twitter.com/search?f=live&lang=en&q=from%3A${username}&src=spelling_expansion_revert_click`,
        'Accept-Language': 'en-US,en;q=0.5',
        'x-guest-token': gt,
    }
    const params: { [key: string]: string } = {
        include_profile_interstitial_type: '1',
        include_blocking: '1',
        include_blocked_by: '1',
        include_followed_by: '1',
        include_want_retweets: '1',
        include_mute_edge: '1',
        include_can_dm: '1',
        include_can_media_tag: '1',
        skip_status: '1',
        cards_platform: 'Web-12',
        include_cards: '1',
        include_ext_alt_text: 'true',
        include_quote_count: 'true',
        include_reply_count: '1',
        tweet_mode: 'extended',
        include_entities: 'true',
        include_user_entities: 'true',
        include_ext_media_color: 'true',
        include_ext_media_availability: 'true',
        send_error_codes: 'true',
        simple_quoted_tweets: 'true',
        q: `from:${username}`,
        tweet_search_mode: 'live',
        count: '100',
        query_source: 'spelling_expansion_revert_click',
        cursor: scroll,
        pc: '1',
        spelling_corrections: '1',
        ext: 'ext=mediaStats%2ChighlightedLabel',
    } // remove scroll if empty
    if (scroll === '') delete params.cursor;

    // make search api url and include all url params
    const url = new URL('https://api.twitter.com/2/search/adaptive.json');
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
    }

    let data;
    try {
        const config: any = {
            headers,
        }

        // add proxy if necessary
        if (proxyConfig !== false) {
            config.httpsAgent = new proxyAgent(proxyConfig);
        }

        // make api request with headers
        const resp = await axios.get(url.href, config);

        data = resp.data;
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return {
        success: true,
        message: 'Successfully retrieved search data',
        data,
    }
}

/**
 * Retrieve a guest token to be used when accessing the twitter search api
 *
 * @param username username for twitter user
 * @param ua current user agent
 * @param proxyConfig config object for proxy service to use
 * @returns guest token or empty
 */
async function getTwitterGuestToken(username: string, ua: string, proxyConfig: ProxyConfig = false): Promise<string> {
    const headers = {
        'User-Agent': ua,
    };

    try {
        const config: any = {
            headers,
        }

        // add proxy if necessary
        if (proxyConfig !== false) {
            config.httpsAgent = new proxyAgent(proxyConfig);
        }

        const resp = await axios.get(`https://twitter.com/${username}`, config);

        // parse guest token from HTML returned, may fail in future twitter updates
        const reg = /document\.cookie = decodeURIComponent\("gt=(\d+); Max-Age=10800; Domain=\.twitter\.com; Path=\/; Secure"\)/m;
        const matches = resp.data.match(reg);

        return matches[1] || '';
    } catch (error: any) {
        return ''
    }
}

/**
 * Get the path to a crawler directory.
 *
 * @param did optional crawl did
 * @returns path to crawler directory
 */
function crawlPath(did = ''): string {
    let PATH = `${BASE_PATH}`

    const bdid = parseBareDid(did);
    if (bdid === false) {
        return PATH;
    }

    PATH = `${PATH}/${bdid.replace(/:/g, '-')}`;

    return PATH;
}

/**
 * Add the infoHash and link of a new post
 * to a crawler configuration's history for use with thread
 * assembly.
 *
 * @param infoHash infoHash of new post
 * @param link canonicalUrl of new post
 * @param did crawl config did
 * @param type type of crawl being updated
 * @returns Success or Failure Message Response
 */
function updateCrawlHistory(infoHash: string, link: string, did: string, type: CrawlType): DataResponse {
    const path = `${crawlPath(did)}/history`;
    const data = `${link} ${infoHash} ${type}\n`;

    try {
        appendFileSync(path, data);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    return { success: true, message: `Updated ${did}'s history` }
}

/**
 * Get the full crawl history that has
 * been stored locally.
 *
 * @param did crawl config did
 * @param reverse return reverse map with infohash as key
 * @returns crawl history as a Map
 */
async function getCrawlHistory(did: string, reverse = false): Promise<Map<string, string>> {
    // get file data
    const path = `${crawlPath(did)}/history`;
    const history = new Map();

    if (existsSync(path) === false) {
        return history;
    }

    const limitVar = getVars('HISTORY_LIMIT');
    const lineLimit = limitVar.HISTORY_LIMIT || 1000;

    try {
        const data = await readLastLines.read(path, lineLimit);

        // convert file data into a map
        data.split('\n').forEach((line: string) => {
            const values = line.split(' ');
            if (reverse) {
                history.set(values[1], values[0]);
            } else {
                history.set(values[0], values[1]);
            }
        })
    } catch (error: any) {
        return history;
    }

    return history;
}

export { getCrawlConfig, assembleCrawlConfigs, removeCrawl, removeCrawledPosts, signCrawledPosts, setDefaultCrawl, getDefaultCrawl, writeRSSCrawl, writeTwitterCrawl, writeWebhoseCrawl, writeSitemapCrawl, crawlFeeds, crawlPath }
