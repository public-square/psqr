import { Command, flags, run as runCommand } from '@oclif/command'
import { Static } from 'runtypes';

import { importPsqrConfig } from '../../functions/config';
import { parseKidKey } from '../../functions/identity';
import { handleRuntypeFail, retrieveFiles } from '../../functions/utility';
import { PsqrConfig } from '../../types/config';

const ora = require('ora');

export default class ConfigImport extends Command {
    static description = 'Import a config and set as default if specified'

    static flags = {
        help: flags.help({ char: 'h' }),
        default: flags.boolean({ char: 'd', default: false, description: 'Set config values as the default in all cases' }),
        key: flags.string({ char: 'd', description: 'Key name to use as default, if not specified the first available key will be used' }),
    }

    static args = [
        {
            name: 'path',
            description: 'path to file containing the config you want to import',
        },
    ]

    async run() {
        const { args, flags } = this.parse(ConfigImport)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.path === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['config:import', '-h']);
        }

        oraStart.succeed('Command ready');
        const oraImport = ora(`Importing config from ${args.path}...`).start();

        // get config file data
        const fileResp = await retrieveFiles([{
            path: args.path,
            relative: true,
        }]);
        if (fileResp.success === false) {
            return oraImport.fail(`Unable to import config because: ${fileResp.message}`)
        }

        try {
            const rfile = fileResp.files[0];
            if (typeof rfile === 'string' || typeof rfile.data !== 'string') {
                return oraImport.fail(`Unable to import config because retrieved config data was invalid`)
            }
            const config: Static<typeof PsqrConfig> = JSON.parse(rfile.data);

            // determine default key name if necessary
            let key = flags.key || '';
            if (flags.default && typeof flags.key === 'undefined') {
                if (config.identity?.keyPairs.length < 1) {
                    return oraImport.fail('No default key specified and no keys available')
                }
                const kid = config.identity.keyPairs[0].kid;
                const keyName = parseKidKey(kid);

                if (keyName === false) {
                    return oraImport.fail(`Unable to parse key name from selected kid: ${kid}`)
                }
                key = keyName;
            }

            // import config
            const impResp = await importPsqrConfig(config, flags.default, key);
            if (impResp.success) {
                return oraImport.succeed(impResp.message);
            }
            return oraImport.fail(impResp.message);
        } catch (error) {
            const msg = handleRuntypeFail(error);
            return oraImport.fail(msg);
        }
    }
}
