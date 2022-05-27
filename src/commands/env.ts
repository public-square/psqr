import { Command, flags, run as runCommand } from '@oclif/command'

import * as env from '../functions/env'
import { log, generateLogInput } from '../functions/log'

const ora = require('ora');

/**
 * View or set psqr environment variables.
 * If a valid env [FILE] is specified, this will replace the
 * current env and be saved.
 */
export default class Env extends Command {
    static description = 'View or set psqr environment vars. If a valid env [FILE] is specified it will replace the current env and be saved.'

    static flags = {
        help: flags.help({ char: 'h' }),
        set: flags.string({ char: 's', description: 'Set and save specific env vars. Format is comma separated key=value' }),
        get: flags.string({ char: 'g', description: 'Get specific saved env vars. Format is comma separated key' }),
        possible: flags.boolean({ char: 'p', default: false, description: 'List all possible env vars' }),
        list: flags.boolean({ char: 'l', default: false, description: 'List current env vars and their values' }),
    }

    static args = [
        {
            name: 'file',
            description: 'path to file containing env vars for the default cli environment',
            default: null,
        },
    ]

    async run() {
        const { args, flags } = this.parse(Env)

        const oraStart = ora('Preparing command...').start();

        const logInput = generateLogInput(process.argv);

        oraStart.succeed('Command ready\n');
        if (args.file !== null) {
            const fVars = env.setVars(args.file, true);

            logInput.title = 'New PSQR Env Vars';
            logInput.code = [{ key: 'Env Vars', obj: fVars }];

            log(logInput);
        } else if (flags.possible) {
            logInput.title = 'Possible PSQR Env Vars';
            logInput.code = [{ key: 'Possible Vars', obj: env.POSSIBLE_VARS }];

            log(logInput);
        } else if (flags.list) {
            const sVars = env.getVars();
            logInput.title = 'Current Environment Vars';
            logInput.code = [{ key: 'Env Vars', obj: sVars }];

            log(logInput);
        } else if (typeof flags.set !== 'undefined' && flags.set.length > 0) {
            const nVars = env.setVars(flags.set, false);

            logInput.title = 'New PSQR Env Vars';
            logInput.code = [{ key: 'Env Vars', obj: nVars }];

            log(logInput);
        } else if (typeof flags.get !== 'undefined' && flags.get.length > 0) {
            const gVars = env.getVars(flags.get);

            logInput.title = 'Requested PSQR Env Vars';
            logInput.code = [{ key: 'Env Vars', obj: gVars }];

            log(logInput);
        } else {
            return runCommand(['env', '-h']);
        }
    }
}
