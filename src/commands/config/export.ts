import { Command, flags, run as runCommand } from '@oclif/command'
import { ExportOptions, exportPsqrConfig } from '../../functions/config';
import { createFiles, FileConfig } from '../../functions/utility';

const ora = require('ora');

export default class ConfigExport extends Command {
    static description = 'Export the full configuration for a specified DID'

    static flags = {
        help: flags.help({ char: 'h' }),
        network: flags.string({ char: 'n', description: 'domain of network to export instead of using default' }),
    }

    static args = [
        {
            name: 'did',
            description: 'DID of the identity that you want to export',
        },
    ]

    async run() {
        const { args, flags } = this.parse(ConfigExport)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.did === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['config:export', '-h']);
        }

        const options: ExportOptions = {
            did: args.did,
        }

        // get any default overrides
        if (typeof flags.network !== 'undefined') options.network = flags.network;

        oraStart.succeed('Command ready');
        const oraGen = ora(`Generating config for ${options.did}...`).start();

        // generate export object
        const conResp = await exportPsqrConfig(options);
        if (conResp.success === false) {
            return oraGen.fail(`Unable to export config because: ${conResp.message}`);
        }
        const config = conResp.data;

        oraGen.succeed('Config generated');
        const oraSave = ora(`Saving config for ${options.did}...`).start();

        // create config file locally
        const fileName = options.did.replace(/:/g, '-') + '-export-' + Date.now() + '.json'
        const files: FileConfig[] = [{
            path: fileName,
            relative: true,
            data: JSON.stringify(config),
        }]
        const configFile = await createFiles(files);

        if (configFile.success) {
            oraSave.succeed(`${configFile.message}\nExported config: ${configFile.files[0]}`);
        } else {
            oraSave.fail(configFile.message);
        }
    }
}