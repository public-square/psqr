import { Command, flags } from '@oclif/command'

import { log, generateLogInput } from '../functions/log'
import { getFullIdentity, getIdentity, parseKidKey } from '../functions/identity';
import { Static } from 'runtypes';
import { Did, PublicInfo } from '../types/identity';
import { handleRuntypeFail } from '../functions/utility';

const ora = require('ora');
const util = require('util');

export default class Identity extends Command {
    static description = `List saved identities. 
This command lists the identities that are currently saved and available.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        default: flags.boolean({ char: 'd', default: false, description: 'List the Default Identity' }),
        all: flags.boolean({ char: 'a', default: false, description: 'Include all possible keys' }),
        verbose: flags.boolean({ char: 'v', default: false, description: 'Output only the raw Identity object' }),
    }

    static args = [
        {
            name: 'kid',
            description: 'KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}',
        },
    ]

    async run() {
        const { args, flags } = this.parse(Identity)

        const oraStart = ora('Preparing command...').start();

        const kid = args.kid;
        const logInput = generateLogInput(process.argv);

        // get the specified or default identity
        let idResp;
        if (flags.all) {
            if (flags.default || typeof kid === 'undefined') {
                idResp = await getFullIdentity();
                logInput.title = 'Full Default Identity';
            } else {
                idResp = await getFullIdentity(kid);
                logInput.title = 'Full Requested Identity';
            }
        } else if (flags.default || typeof kid === 'undefined') {
            idResp = await getIdentity();
            logInput.title = 'Default Identity';
        } else {
            idResp = await getIdentity(kid);
            logInput.title = 'Requested Identity';
        }

        if (idResp.success === false) return oraStart.fail(idResp.message);
        const id = idResp.identity;

        oraStart.succeed('Retrieved the Identity');
        if (flags.verbose === true) {
            return console.log(util.inspect(id, {
                showHidden: false,
                depth: null,
                colors: true,
                compact: false,
            }));
        }

        let didDoc: Static<typeof Did>;
        let publisher: Static<typeof PublicInfo>;
        try {
            didDoc = Did.check(id.didDoc);
            publisher = didDoc.psqr.publicIdentity;
        } catch (error) {
            const msg = handleRuntypeFail(error);
            console.error(msg);
            return 0;
        }

        logInput.code = [
            {
                key: 'KID',
                obj: kid || id.keyPairs[0].private.kid,
            },
            {
                key: 'Public Info',
                obj: publisher,
            },
        ]

        // include a list of all key names if requested
        if (flags.all) {
            logInput.code.push({
                key: 'Key Names',
                obj: id.keyPairs.map(p => parseKidKey(p.private.kid)),
            })
        }

        log(logInput);
    }
}
