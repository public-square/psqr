import { Command, flags, run as runCommand } from '@oclif/command';

import { createPost } from '../../functions/post';
import { getVars } from '../../functions/env';
import { createFiles, handleRuntypeFail, retrieveFiles } from '../../functions/utility';
import { PostSkeleton } from '../../types/post';
import { getIdentity } from '../../functions/identity';

const getStdin = require('get-stdin');
const ora = require('ora');

/**
 * Creates Post JSON using input data.
 *
 * e.g.
 * ```typescript
 * psqr post:create Hello \
 *      --raw \
 *      --description 'This is a description' \
 *      --publishDate 1620151913 \
 *      --title 'Post Title' \
 *      --geo 'newyork' \
 *      --politicalSubdivision 'US/New_York/Broome' \
 *      --image 'https://newpress.co/images/logo-dark-wide.png' \
 *      --canonicalUrl 'https://newpress.co/posts/hello'
 * ```
 */
export default class PostCreate extends Command {
    static description = 'Create Post JSON with input data'

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as DATA' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'DATA specified is raw (not a filepath), you need to escape "' }),
        kid: flags.string({ char: 'k', description: 'KID string, can be set in env' }),

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
        const { args, flags } = this.parse(PostCreate)

        if (flags.stdin === true) args.body = await getStdin();

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.body = await getStdin();

        if (typeof args.body === 'undefined' || args.body === '') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['post:create', '-h']);
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
        if (idResp.success === false) return oraCreate.fail(idResp.message);
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

        // create post object
        const resp = await createPost(skel, identity);
        if (resp.success === false) {
            oraCreate.fail(resp.message);
            return false;
        }

        oraCreate.succeed(resp.message);
        const oraSave = ora('Saving Post...').start();

        const postFile = await createFiles([
            {
                path: `post-${resp.data.created}.json`,
                relative: true,
                data: JSON.stringify(resp.data),
            },
        ]);

        if (postFile.success) {
            oraSave.succeed(`${postFile.message}\nGenerated post at: ${postFile.files[0]}`);
        } else {
            oraSave.fail(postFile.message);
        }
    }
}
