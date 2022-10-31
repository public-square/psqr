import { importJWK, CompactSign } from 'jose';

import { Static } from 'runtypes';

import { generateInfoHash, parseKidKey } from './identity';
import { Post, JwsPost, PostSkeleton } from '../types/post';
import { Did, Identity, KeyPair } from '../types/identity';
import { BroadcastConfig, DataResponse, ListResponse } from '../types/interfaces'
import { concurrentPromises, handleRuntypeFail } from './utility';
import { getNetworkConfig } from './network';

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ValueFilters } from '../types/base-types';
import { NetworkConfig } from '../types/network';
const http = require('http');
const https = require('https');
const ogs = require('open-graph-scraper');

const encoder = new TextEncoder();

export interface PutConfig extends BroadcastConfig {
    hash: string;
}

/** JWS Data including Hash */
export interface JWSData {
    jws: Static<typeof JwsPost>;
    hash: string;
}

export interface JWSResponse extends DataResponse {
    data?: JWSData;
}

interface PublishRequestConfig extends AxiosRequestConfig {
    id?: string;
}

interface PublishResponse extends AxiosResponse {
    config: PublishRequestConfig;
}

/**
 * Create a signed JWS string using specified identity.
 * Content param must be a complete JSON string containing data to be used.
 *
 * @param content JSON string to encrypt
 * @param keyPair obj containing keys to use
 * @param postData bool if the provided string is a post
 * @returns Success or Failure Message Response and signed JWS string
 */
async function createJWS(content: string, keyPair: Static<typeof KeyPair>, postData = true): Promise<JWSResponse> {
    try {
        // check keys
        if (keyPair?.private === null) return { success: false, message: 'No keys available to use' };

        // get key from JWK and validate content as Post
        let hash = '';
        const key = await importJWK(keyPair.private);
        if (postData) {
            const contentObj = Post.check(JSON.parse(content));
            hash = contentObj.infoHash;
        }

        // generate JWS token and include kid as header
        const token = await new CompactSign(encoder.encode(content))
            .setProtectedHeader({
                alg: 'ES384',
                kid: keyPair.kid,
            })
            .sign(key);

        const jws = JwsPost.check({
            token,
        });

        return {
            success: true,
            message: 'Successfully created JWS',
            data: { jws, hash },
        }
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return {
            success: false,
            message: msg,
        }
    }
}

/**
 * Assembles a Post object from a PostSkeleton.
 *
 * @param skeleton post skeleton object
 * @param identity obj containing identity to use
 * @returns Success or Failure Message Response with post as data
 */
async function createPost(skeleton: Static<typeof PostSkeleton>, identity: Static<typeof Identity>): Promise<DataResponse> {
    try {
        // validate identity and skeleton
        PostSkeleton.check(skeleton);
        Identity.check(identity);

        // ensure minimum values for post
        if (skeleton.title + skeleton.description + skeleton.image === '') {
            return { success: false, message: 'Skeleton had an empty title, description, and image' };
        }

        // validate did doc
        const didDoc = Did.check(identity.didDoc);
        const publisher = didDoc.psqr.publicIdentity;

        // get key, keyId, and DID from identity
        const keyPair = identity.keyPairs[0];
        const key = await importJWK(keyPair.private);
        const keyId = parseKidKey(keyPair.kid);
        if (keyId === false) return { success: false, message: 'Unable to parse key name' };

        // assemble post and validate
        const post = Post.check({
            name: '',
            infoHash: '',
            created: Date.now(),
            createdBy: didDoc.id,
            urlList: [''],
            announce: [''],
            files: [{
                name: '',
                offset: 0,
                length: '',
            }],
            provenance: {
                jwk: keyPair.public,
                signature: '',
                publisher: publisher,
            },
            info: {
                publicSquare: {
                    package: {
                        geo: skeleton.geo,
                        politicalSubdivison: skeleton.politicalSubdivision,
                        publishDate: skeleton.publishDate,
                        lang: skeleton.lang,
                        title: skeleton.title,
                        description: skeleton.description,
                        image: skeleton.image,
                        canonicalUrl: skeleton.canonicalUrl,
                        body: skeleton.body,
                        references: {
                            content: {
                                reply: skeleton.reply || '',
                                amplify: '',
                                like: '',
                            },
                        },
                    },
                },
            },
        });

        // calculate infoHash
        post.infoHash = generateInfoHash(post.info);
        post.name = post.infoHash + '.torrent';

        // calculate signature
        post.provenance.signature = await new CompactSign(encoder.encode(JSON.stringify(post.info)))
            .setProtectedHeader({
                alg: 'ES384',
                kid: keyPair.kid,
            })
            .sign(key);

        return {
            success: true,
            message: 'Successfully created Post',
            data: post,
        }
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return {
            success: false,
            message: msg,
        }
    }
}

/**
 * Create a post object using the web page as its url.
 * OG data is pulled and used to fill in the post information.
 * Note: currently, no post body is retrieved.
 *
 * @param url url of web page to pull og data from
 * @param identity obj containing identity to use
 * @param filters object containing the filter lists
 * @returns Response obj with post as data
 */
async function createUrlPost(url: string, identity: Static<typeof Identity>, filters: Static<typeof ValueFilters> | false = false): Promise<DataResponse> {
    // ogs options
    const options = {
        url: url,
        onlyGetOpenGraphInfo: true,
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

    // assemble post skeleton
    let skeleton;
    try {
        const ogsData = await ogs(options);

        // determine publishDate
        let publishDate = Date.now();
        const dateKeys = [
            'ogArticlePublishedTime',
            'articlePublishedTime',
            'ogArticleModifiedTime',
            'articleModifiedTime',
        ]
        for (let i = 0; i < dateKeys.length; i++) {
            const key = dateKeys[i];

            if (typeof ogsData.result[key] !== 'undefined') {
                publishDate = new Date(ogsData.result[key]).getTime();
                break;
            }
        }

        skeleton = PostSkeleton.check({
            body: '',
            description: ogsData.result.ogDescription || ogsData.result.twitterDescription || '',
            lang: ogsData.result.ogLocale || '',
            publishDate: publishDate,
            title: ogsData.result.ogTitle || ogsData.result.twitterTitle || '',
            geo: '',
            politicalSubdivision: '',
            image: ogsData.result.ogImage?.url || ogsData.result.twitterImage?.url || '',
            canonicalUrl: ogsData.result.ogUrl || url,
        });

        // apply value filters if necessary
        if (filters !== false) {
            skeleton = filterPostValues(skeleton, filters);
        }
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        return { success: false, message: msg }
    }

    // generate post
    const postResp = await createPost(skeleton, identity);

    // add original url
    postResp.data = {
        post: postResp.data,
        originalUrl: url,
    }

    return postResp;
}

/**
 * Publish multiple posts asynchronously with a limit of 100 concurrent requests.
 *
 * @param postData array of objects containing the hash and the JWS
 * @param config base post config to change the hash of for each post
 * @param lgr optional logger function
 * @returns Array of list responses for each post
 */
async function putMultiplePosts(postData: JWSData[], config: PutConfig, lgr: Function = () => { /* no log */ }): Promise<ListResponse[]> {
    // setup axios with keepalive
    const agentConfig: any = {
        keepAlive: true,
    }

    // allow self-signed certs if specified
    if (config.selfSigned === true) {
        agentConfig.rejectUnauthorized = false;
    }

    // create axios client
    const ax = axios.create({
        timeout: 60000,
        httpAgent: new http.Agent(agentConfig),
        httpsAgent: new https.Agent(agentConfig),
        maxRedirects: 10,
        maxContentLength: 50 * 1000 * 1000,
    });

    // create request promises
    const poolParams = postData.map(p => {
        const pc: PutConfig = {
            hash: p.hash,
            broadcaster: config.broadcaster,
            selfSigned: config.selfSigned,
        };

        return [p.jws, pc, lgr, ax]
    });

    const allPromises = await concurrentPromises(poolParams, putPost, 100);

    return allPromises;
}

/**
 * Publish Post data to specified Broadcaster(s).
 * Data parameter must be the complete string that is to be
 * sent to the Broadcaster.
 *
 * @param jwsPost JwsPost obj to be published to broadcaster
 * @param config general request config including broadcaster(s)
 * @param lgr logger function to log activity
 * @param ax custom instance of axios to use instead of default
 * @returns outcome of PUT request
 */
async function putPost(jwsPost: Static<typeof JwsPost>, config: PutConfig, lgr: Function = () => { /* no log */ }, ax: AxiosInstance | false = false): Promise<ListResponse> {
    const hash = config.hash;
    const failMsg = `Publish for post with hash ${config.hash} failed because: `

    // get array of broadcasters to send post to
    let bResp;
    const domains = config.broadcaster;
    if (domains === null || domains === '') {
        // use default broadcasters if none specified
        bResp = await getNetworkConfig()
    } else {
        bResp = await getNetworkConfig(domains)
    }
    if (bResp.success === false) {
        lgr(failMsg + bResp.message);
        return {
            success: false,
            message: bResp.message,
            items: [],
        }
    }

    try {
        // allow self-signed certs if specified
        if (ax === false && config.selfSigned === true) {
            const httpsAgent = new https.Agent({
                rejectUnauthorized: false,
            });
            axios.defaults.httpsAgent = httpsAgent;
        }

        // ensure post data is valid
        JwsPost.check(jwsPost);
    } catch (error: any) {
        const msg = handleRuntypeFail(error);
        lgr(failMsg + msg);
        return {
            success: false,
            message: msg,
            items: [],
        }
    }

    // we only need the broadcaster configs
    const broadcasters: Static<typeof NetworkConfig>[] = bResp.data;

    // loop through broadcasters and create request promises
    const responses = [];
    const client = ax === false ? axios : ax;
    for (let i = 0; i < broadcasters.length; i++) {
        try {
            // assemble broadcaster url
            const bc = broadcasters[i].services.api.url;
            const url = `${bc}/broadcast/${hash}`;

            lgr(`Publishing post to ${url}`);
            const config: PublishRequestConfig = {
                id: broadcasters[i].domain,
                url: url,
                method: 'PUT',
                data: jwsPost,
            };
            const response = client(config);

            // include all responses
            responses.push(response)
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            lgr(failMsg + msg);
            return {
                success: false,
                message: msg,
                items: [],
            }
        }
    }

    // once all queries have been returned or it fails, return a response
    return Promise.allSettled(responses).then(value => {
        const items = value.map(v => {
            if (v.status === 'rejected') {
                lgr(`Rejected! Unable to publish post with hash ${hash} to ${v.reason.config.id} because ${v.reason.response?.status || 'Error'}: ${v.reason.response?.data?.error || v.reason.message}`)
                return {
                    success: false,
                    message: v.reason.config.id,
                    data: v.reason.message,
                }
            }

            const resp: PublishResponse = v.value;
            return {
                success: true,
                message: resp.config.id,
                data: resp.data,
            }
        });

        // evaluate publish success
        const succeeded = items.filter(i => i.success);
        const ratio = succeeded.length + '/' + broadcasters.length;
        let message = `post with hash ${hash}. ${ratio} broadcasters were successful.`;
        let response: ListResponse;

        // fail, partial success, full success
        if (succeeded.length === 0) {
            message = 'Failed to publish ' + message;
            response = { success: false, message, items }
        } else if (succeeded.length < broadcasters.length) {
            message = 'Partially published ' + message;
            response = { success: true, message, items }
        } else {
            message = 'Successfully published ' + message;
            response = { success: true, message, items }
        }

        lgr(message);
        return response;
    });
}

/**
 * Remove any values from a post skeleton that are in the filter list
 * and return the resultant skeleton.
 *
 * @param skeleton post skeleton with values to be filtered
 * @param filters object containing the filter lists
 * @returns filtered post skeleton
 */
function filterPostValues(skeleton: Static<typeof PostSkeleton>, filters: Static<typeof ValueFilters>): Static<typeof PostSkeleton> {
    let key: keyof Static<typeof PostSkeleton>;
    for (key in filters) {
        if (Object.prototype.hasOwnProperty.call(filters, key)) {
            const list = filters[key];
            if (typeof list === 'undefined') continue;

            for (let i = 0; i < list.length; i++) {
                const filterValue = list[i];

                const skel = skeleton[key];
                if (skel === filterValue) {
                    if (typeof skel === 'string') {
                        // @ts-ignore: we just verified this is a string
                        skeleton[key] = '';
                    } else if (typeof skel === 'number') {
                        // @ts-ignore: we just verified this is a number
                        skeleton[key] = 0;
                    }
                }
            }
        }
    }

    return skeleton;
}

export { putPost, putMultiplePosts, createJWS, createPost, createUrlPost };
