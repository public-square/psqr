const chalk = require('chalk');
const util = require('util');

interface CodeObj {
    key: string;
    obj: any;
}

export interface LogInput {
    title: string;
    cmd: string;
    body?: string;
    code?: CodeObj[];
}

/**
 * Log information to the CLI in a user-readable and structured format
 * Use this as a standard way to output code, data, responses, etc. to the user
 *
 * @param input obj containing all necessary elements for logging
 */
function log(input: LogInput) {
    // divider lines to separate sections
    const col = process.stdout.columns || 30;
    const line = '-'.repeat(col);

    // chalk styles that can be re-used
    const header = chalk.bold.whiteBright;
    const muted = chalk.dim;

    // bare minimum output
    let output = `${header(input.title)}
${muted(input.cmd)}

${muted(line)}`;

    // add body if included
    if (typeof input.body !== 'undefined') {
        output += `

${input.body}

${muted(line)}`
    }

    // format and add code if included
    if (typeof input.code !== 'undefined') {
        console.log(output);
        input.code.forEach(el => {
            console.log(`
${muted(el.key + ':')}`)

            console.log(util.inspect(el.obj, {
                showHidden: false,
                depth: null,
                colors: true,
                compact: false,
            }));
        });
        return
    }

    console.log(output);
}

/**
 * Generate a LogInput object with the required standard properties
 * Use this to simplify creating a LogInput so you only need to add unique data
 *
 * @param argv command args from process.argv
 * @returns LogInput object with required properties
 */
function generateLogInput(argv: string[]): LogInput {
    const args = argv.splice(2, (argv.length - 2));
    const logInput: LogInput = {
        title: `${args[0]} Command Ouput`,
        cmd: `psqr ${args.join(' ')}`,
    }

    return logInput;
}

export {log, generateLogInput}
