import { Command, flags, run as runCommand } from '@oclif/command';

import { searchES, ESConfig } from '../functions/search';
import { getVars } from '../functions/env';
import { LogInput, log, generateLogInput } from '../functions/log';

const ora = require('ora');

/**
 * Search ElasticSearch for a specified string.
 */
export default class Search extends Command {
    static description = 'Search ElasticSearch for a specific string'

    static flags = {
        help: flags.help({ char: 'h' }),
        page: flags.string({ char: 'p', description: 'ElasticSearch page to query, defaults to 1' }),
        indexers: flags.string({ char: 'i', description: 'Colon (:) separated list of domains of Indexer(s) to search' }),
        body: flags.boolean({ char: 'b', default: false, description: 'Return only the source body from the response object' }),
        nometa: flags.boolean({ char: 'm', default: false, description: 'Remove metainfo from the response object' }),
        raw: flags.boolean({ char: 'r', default: false, description: 'Output only the raw responses' }),
    }

    static args = [
        {
            name: 'query',
            description: 'String that you want to search',
        },
    ]

    async run() {
        const { args, flags } = this.parse(Search)

        const oraStart = ora('Preparing command...').start();

        if (typeof args.query === 'undefined') {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided')
            return runCommand(['post', '-h']);
        }

        const env = getVars();

        const query = args.query;

        const config: ESConfig = {
            page: Number(flags.page) || 1,
            indexer: flags.indexers || '',
            selfSigned: env.ALLOW_SELF_SIGNED === 'true',
        }

        const logInput: LogInput = generateLogInput(process.argv)

        oraStart.succeed('Command ready')
        const oraSearch = ora('Searching ES...').start();

        const resp = await searchES(query, config);

        if (resp.success) {
            oraSearch.succeed(resp.message + '\n')
            if (flags.raw === true) return console.log(resp.items);
        } else {
            return oraSearch.fail(resp.message + '\n')
        }

        const combinedResults = resp.items.filter(r => r.success).map(r => r.data);

        logInput.code = combinedResults.map(r => {
            let obj = r.data.searchResults;
            if (flags.nometa === true) obj = obj.map((sr: any) => {
                delete sr._source.metainfo;
                return sr
            });
            if (flags.body === true) obj = obj.map((sr: any) => sr._source.body);

            return {
                key: r.config.url,
                obj,
            }
        })

        log(logInput);
    }
}
