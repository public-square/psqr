import { Command, flags, run as runCommand } from '@oclif/command'

import { parseDidUrl } from '../../functions/identity';
import { existsSync } from 'fs';

const ora = require('ora');
const homedir = require('os').homedir();
const IDENTITY_PATH = `${homedir}/.config/psqr/identities`;

export default class IdentityResolve extends Command {
    static description = 'For Self Hosting the Identity, find the local file and the URL that must serve it.';

    static flags = {
        help: flags.help({ char: 'h' }),
    }

    static args = [
        {
            name: 'did',
            description: 'DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}',
        },
    ]

    async run() {
        const { args } = this.parse(IdentityResolve);

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined' && !args.did) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['identity:resolve', '-h']);
        }

        const did = args.did;

        oraStart.succeed('Command ready')
        const oraRun = ora('Resolving Identity...').start();

        // local DID File PATH
        const didPath = `${IDENTITY_PATH}/${did.replace(/:/g, '-')}/identity.json`;

        if (existsSync(didPath) === false) {
            oraRun.fail('DID JSON File does not exist at path location.');
            return false;
        }

        // identity.json https url based on DID Url
        const url = parseDidUrl(did);

        // create JSON Object of Data
        const data = {
            localFile: didPath,
            url: url,
        };

        // return results and success
        return oraRun.succeed(`${JSON.stringify(data)}`);
    }
}
