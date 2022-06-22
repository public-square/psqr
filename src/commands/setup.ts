import { Command, flags } from '@oclif/command'
import { setVars } from '../functions/env';
import { promptIdentitySetup, promptProxySetup, persistIdentitySetup, persistProxySetup, promptNetworkSetup, persistNetworkSetup, promptCrawlSetup, persistCrawlSetup } from '../functions/setup';
import { log, generateLogInput } from '../functions/log'

const ora = require('ora');
const inquirer = require('inquirer');

/**
 * Setup your environment.
 * This utility will prompt you for information to set up your identity,
 * keys, necessary networking, and any content crawling configuration you may need.
 */
export default class Setup extends Command {
    static description = `This utility will prompt you for the all of the necessary info to get your environment up and running.
It will set up your identity, keys, necessary networking, and any content crawling configuration you may need.
`

    static flags = {
        help: flags.help({ char: 'h' }),
        // script: flags.boolean({char: 's',default: false, description: 'Generate a shell and batch script that will replicate the setup you create with this command.'}),
    }

    async run() {
        // welcome header
        const logInput = generateLogInput(process.argv);
        logInput.title = 'Welcome to the PSQR setup utility';
        logInput.body = 'This utility will prompt you for the all of the necessary info to get your environment up and running.';
        log(logInput);

        // determine what the user wants to do with psqr
        const userOptions = [
            'Create and/or Manage an Identity',
            'Create and Publish content',
            'Crawl and Publish content from other sources',
        ]
        const userType = await inquirer.prompt({
            type: 'list',
            name: 'type',
            message: 'What do you want to do with the PSQR client?',
            choices: userOptions,
            default: 0,
        });

        // setup language and network if necessary
        const defLang = 'en/US';
        // skip and use defaults for now
        // const defConfirm = await inquirer.prompt({
        //     type: 'confirm',
        //     name: 'confirm',
        //     message: 'Do you want to use the default "en/US" language and the default ology.com network?',
        //     default: true
        // });
        const defConfirm = { confirm: true };
        if (defConfirm.confirm === false) {
            const lang = await inquirer.prompt({
                type: 'input',
                name: 'lang',
                message: 'What language will you be using?',
                default: defLang,
            });
            setVars(`DEFAULT_LANGUAGE=${lang.lang}`, false);

            // determine network setup and then persist
            const oraNet = ora();
            const netSetup = await promptNetworkSetup();
            const netResp = await persistNetworkSetup(netSetup, oraNet);
            if (netResp.success === false) {
                oraNet.fail('Network setup cancelled because: ' + netResp.message);
                return false;
            }
            oraNet.succeed('Network setup was successful.');
        }

        // determine identity setup and then persist
        const oraId = ora();
        const idSetup = await promptIdentitySetup();
        const idResp = await persistIdentitySetup(idSetup.data, oraId);
        if (idResp.success === false) {
            oraId.fail('Identity setup cancelled because: ' + idResp.message);
            return false;
        }
        oraId.succeed(`Identity setup for ${idSetup.data.did} was successful. Default identity set to ${idResp.identity.keyPairs[0].kid}`);

        /****************************************************************************/
        // CONTENT CREATOR check
        if (userOptions.indexOf(userType.type) <= 0) {
            const msg = `Your environment is now completely set up for ${idSetup.data.did}.\n` +
                'If you want to Propagate your Identity you can do so with the command:\n\n' +
                `psqr identity:propagate ${idSetup.data.did}`
            return ora(msg).succeed();
        }

        /****************************************************************************/
        // CONTENT CRAWLER check
        if (userOptions.indexOf(userType.type) <= 1) {
            const msg = `Your environment is now completely set to create content for ${idSetup.data.did}.\n` +
                'You can create, sign, and publish a post with a command like:\n\n' +
                `psqr post 'Post body' \\
   --raw \\
   --description 'This is a description' \\
   --publishDate 1620151913 \\
   --title 'Post Title' \\
   --geo 'newyork' \\
   --politicalSubdivision 'US/New_York/Broome' \\
   --image 'https://vpsqr.com/assets/ology-icon.png' \\
   --canonicalUrl 'https://vpsqr.com/posts/first'\n\n` +
                'Or in separate steps with "psqr post:create", "psqr post:sign", and "psqr post:put".'
            return ora(msg).succeed();
        }

        // setup proxy if necessary
        const proxyConfirm = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Do you want to setup network proxy variables?',
            default: false,
        });
        if (proxyConfirm.confirm) {
            const oraProxy = ora();
            const proxySetup = await promptProxySetup();
            const proxyResp = await persistProxySetup(proxySetup);
            if (proxyResp.success === false) {
                oraProxy.fail('Proxy setup cancelled because: ' + proxyResp.message);
                return false;
            }
            oraProxy.succeed('Proxy setup was successful. Use it with --proxy when applicable.');
        }

        // setup any crawlers that are needed
        const oraCrawl = ora();
        const crawlSetup = await promptCrawlSetup(idResp.identity);
        const crawlResp = await persistCrawlSetup(crawlSetup, oraCrawl);
        if (crawlResp.success === false) {
            oraCrawl.fail('Crawl setup cancelled because: ' + crawlResp.message);
            return false;
        }
        oraCrawl.succeed('Crawl setup was successful.');

        // end message for content crawler setup
        const msg = `Your environment is now completely set to crawl content for ${idSetup.data.did}.\n` +
        'You can crawl, sign, and publish posts from all of the default crawls with the command:\n\n' +
        'psqr crawl\n\n' +
        'Or in separate steps with "psqr crawl:pull" and "psqr crawl:publish".'
        return ora(msg).succeed();
    }
}
