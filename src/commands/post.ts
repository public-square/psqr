import { Command, flags, run as runCommand } from '@oclif/command';

import * as post from '../functions/post';
import { getVars } from '../functions/env';
import { handleRuntypeFail, retrieveFiles } from '../functions/utility';
import { PostSkeleton } from '../types/post';
import { generateLogInput, log } from '../functions/log';
import { getIdentity } from '../functions/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * psqr post Hello \
 *      --raw \
 *      --description 'This is a description' \
 *      --publishDate 1620151913 \
 *      --title 'Post Title' \
 *      --geo 'newyork' \
 *      --politicalSubdivision 'US/New_York/Broome' \
 *      --image 'https://newpress.co/images/logo-dark-wide.png'
 *      --canonicalUrl 'https://newpress.co/posts/hello'
 */
export default class Post extends Command {
    static description = 'Create post, sign it with specified key, and publish to Broadcaster'

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as DATA' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'DATA specified is raw (not a filepath), you need to escape "' }),
        broadcasters: flags.string({ char: 'b', description: 'Colon (:) separated list of domains of Broadcaster(s) to put to' }),
        kid: flags.string({ char: 'k', description: 'KID string' }),

        description: flags.string({ char: 'e', description: 'Post description' }),
        lang: flags.string({ char: 'l', description: 'Post language, can be set in env' }),
        publishDate: flags.string({ char: 'p', description: 'Post publish date' }),
        title: flags.string({ char: 't', description: 'Post title' }),
        geo: flags.string({ char: 'g', description: 'Post geo' }),
        politicalSubdivision: flags.string({ char: 'o', description: 'Post political subdivision' }),
        image: flags.string({ char: 'i', description: 'Post image' }),
        canonicalUrl: flags.string({ char: 'c', description: 'Post canonical url' }),
    }

    static args = [
        {
            name: 'body',
            description: 'Relative path to body data file or JSON body data',
        },
    ]

    async run() {
        const { args, flags } = this.parse(Post)

        if (flags.stdin === true) args.body = await getStdin();

        const oraStart = ora('Preparing command...').start();

        if (args.body === null) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['post', '-h']);
        }

        const env = getVars();

        if (flags.kid === null && env.DEFAULT_DID === null) {
            oraStart.fail('You need to specify a KID either as a flag with this command or set it in the psqr env');
            return false;
        }

        if (flags.lang === null && env.DEFAULT_LANGUAGE === null) {
            oraStart.fail('You need to specify a language either as a flag with this command or set it in the psqr env');
            return false;
        }

        oraStart.succeed('Command ready')
        const oraCreate = ora('Creating Post...').start();

        // get identity object
        const kid = flags.kid || '';
        const idResp = await getIdentity(kid);
        if (idResp.success === false) return oraCreate.fail('Unable to get identity because: ' + idResp.message);
        const identity = idResp.identity;

        // get body data, from file if needed
        let body = args.body;
        if (flags.raw === false && flags.stdin === false) {
            const bResp = await retrieveFiles([{
                path: body,
                relative: true,
            }])
            if (bResp.success === false || typeof bResp.files[0] !== 'object') return oraCreate.fail(bResp.message);
            body = bResp.files[0].data;
        }

        // assemble post skeleton
        let skel;
        try {
            skel = PostSkeleton.check({
                body,
                description: flags.description,
                lang: flags.lang || env.DEFAULT_LANGUAGE,
                publishDate: Number(flags.publishDate),
                title: flags.title,
                geo: flags.geo,
                politicalSubdivision: flags.politicalSubdivision,
                image: flags.image,
                canonicalUrl: flags.canonicalUrl,
            })
        } catch (error) {
            const msg = handleRuntypeFail(error);
            oraCreate.fail(msg);
            return false;
        }

        const resp = await post.createPost(skel, identity);
        if (resp.success === false) {
            oraCreate.fail(resp.message);
            return false;
        }

        oraCreate.succeed(resp.message);
        const oraJWS = ora('Creating JWS...').start();

        const content = JSON.stringify(resp.data);
        const respJWS = await post.createJWS(content, identity);
        if (respJWS.success === false || typeof respJWS.data === 'undefined') return oraCreate.fail(resp.message);

        const { jws, hash } = respJWS.data;
        oraJWS.succeed(respJWS.message + '\nHash: ' + hash);

        const oraPut = ora('Publishing Post...').start();

        const putConfig: post.PutConfig = {
            hash,
            broadcaster: flags.broadcasters || '',
            selfSigned: env.ALLOW_SELF_SIGNED === 'true',
        }

        const pResp = await post.putPost(jws, putConfig);
        if (pResp.success === false) return oraPut.fail(pResp.message);
        oraPut.succeed(pResp.message + '\n');

        const logInput = generateLogInput(process.argv)
        logInput.code = pResp.items.map(i => {
            return { key: i.message, obj: i.data }
        });
        log(logInput);
    }
}
