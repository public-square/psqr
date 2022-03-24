import { Command, flags, run as runCommand } from '@oclif/command'

import { putPost, PutConfig } from '../../functions/post';
import { getVars } from '../../functions/env';
import { generateLogInput, log } from '../../functions/log';
import { retrieveFiles } from '../../functions/utility';

const getStdin = require('get-stdin');
const ora = require('ora');

export default class PostPut extends Command {
    static description = 'Publish content to the specified Broadcaster'

    static flags = {
        help: flags.help({ char: 'h' }),
        stdin: flags.boolean({ char: 's', default: false, description: 'Use STDIN input as DATA' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'DATA specified is raw (not a filepath), you need to escape "' }),
        broadcasters: flags.string({ char: 'b', description: 'Colon (:) separated list of domains of Broadcaster(s) to put to instead of the defaults' }),
    }

    static args = [
        {
            name: 'hash',
            description: 'infoHash of the post to be published',
        },
        {
            name: 'data',
            description: 'Relative path to signed post content as a JWS or JSON post data, expected format: {config: JWS}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(PostPut)

        const oraStart = ora('Preparing command...').start();

        if (flags.stdin === true) args.data = await getStdin();

        if (args.hash === null || args.data === null) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['post:put', '-h']);
        }

        const env = getVars();

        // get post data, from file if needed
        let data = args.data;
        if (flags.raw === false && flags.stdin === false) {
            const dResp = await retrieveFiles([{
                path: data,
                relative: true,
            }])
            if (dResp.success === false || typeof dResp.files[0] !== 'object') return oraStart.fail(dResp.message);
            data = dResp.files[0].data;
        }

        const jwsPost = JSON.parse(data);
        const hash = args.hash;

        const config: PutConfig = {
            hash,
            broadcaster: flags.broadcasters || '',
            selfSigned: env.ALLOW_SELF_SIGNED === 'true',
        }

        oraStart.succeed('Command ready')
        const oraPut = ora('Publishing Post...').start();

        const resp = await putPost(jwsPost, config);
        if (resp.success === false) {
            oraPut.fail(resp.message);
            return false;
        }
        oraPut.succeed(resp.message + '\n')

        const logInput = generateLogInput(process.argv)
        logInput.code = resp.items.map(i => {
            return { key: i.message, obj: i.data }
        });
        log(logInput);
    }
}
