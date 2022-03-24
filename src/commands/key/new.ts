import { Command, flags, run as runCommand } from '@oclif/command'

import { addIdentity, addNewKeyPair, getFullIdentity } from '../../functions/identity';

const ora = require('ora');

export default class KeyNew extends Command {
    static description = `Create new Keys and add them to a pre-existing identity.
`

    static flags = {
        help: flags.help({ char: 'h' }),
    }

    static args = [
        {
            name: 'did',
            description: 'DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}',
        },
        {
            name: 'names',
            description: 'Comma (,) separated list of names of keys to create',
        },
    ]

    async run() {
        const { args } = this.parse(KeyNew)

        const oraStart = ora('Preparing command...').start();

        if (args.did === null && args.names === null) {
            // if you want to run another command it must be returned like so
            oraStart.fail('Insufficient arguments provided\n')
            return runCommand(['key:new', '-h']);
        }

        const did = args.did;
        const keyNames = args.names.split(',');

        // retrieve identity
        const idResp = await getFullIdentity(did);
        if (idResp.success === false) {
            return oraStart.fail('Unable to retrieve full identity because: ' + idResp.message);
        }
        let identity = idResp.identity;

        oraStart.succeed('Command ready')
        const oraAdd = ora('Adding new Key Pairs...').start();

        for (let i = 0; i < keyNames.length; i++) {
            const name = keyNames[i];

            const nkResp = await addNewKeyPair(identity, did, name);
            if (nkResp.success === false) return oraAdd.fail(nkResp.message);

            identity = nkResp.identity;
        }

        // store full identity
        const addResp = await addIdentity(identity);

        if (addResp.success) {
            oraAdd.succeed(`Successfully added new keys to ${did}`)
        } else {
            oraAdd.fail(addResp.message);
        }
        return addResp.success;
    }
}
