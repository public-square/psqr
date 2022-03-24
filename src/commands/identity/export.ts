import { Command, flags, run as runCommand } from '@oclif/command';
import { createFiles, FileConfig } from '../../functions/utility';
import { getFullIdentity } from '../../functions/identity';

const ora = require('ora');
const inquirer = require('inquirer');

export default class IdentityExport extends Command {
  static description = `Export the did doc of an identity.
If you wish to export your stored private keys you need to specify each key by name.
`

  static flags = {
    help: flags.help({char: 'h'}),
    keys: flags.string({char: 'k', description: 'Comma separated list of key names to export. THIS WILL EXPORT PRIVATE KEYS.'}),
    pretty: flags.boolean({ char: 'p', default: false, description: 'Pretty-print the exported identity doc' }),
  }

  static args = [
      {
          name: 'did',
          description: 'DID of the identity that you want to export, skip for default',
      },
  ]

  async run() {
    const {args, flags} = this.parse(IdentityExport);

    // confirm export of private keys if specified
    let keyNames: string[] = [];
    if (typeof flags.keys !== 'undefined') {
        const confirmation = await inquirer.prompt({
            type: 'confirm',
            name: 'keyConfirmation',
            message: `Are you sure you want to export the private keys: ${flags.keys}?`,
            default: false
        });

        if (confirmation['keyConfirmation'] === false) {
            return ora('Export cancelled due to private keys.').start().fail();
        }
        keyNames = flags.keys.split(',');
    }

    const defaultId = typeof args.did === 'undefined';
    const oraStart = ora(`Retrieving ${defaultId ? 'default' : args.did } identity...`).start();

    let identityResp;
    if (defaultId) {
        identityResp = await getFullIdentity();
    } else {
        identityResp = await getFullIdentity(args.did);
    }

    if (identityResp.success === false) {
        oraStart.fail(identityResp.message);
        return false;
    }
    const didDoc = identityResp.identity.didDoc;
    const keyPairs = identityResp.identity.keyPairs;

    oraStart.succeed(identityResp.message);
    const oraSave = ora(`Creating identity file for ${didDoc.id}...`).start();

    // create export files locally
    const exportFolder = didDoc.id.replace(/[:\/]/g, '-');
    let files: FileConfig[] = [];

    // add did export file
    const didFileName =  exportFolder + '/identity.json';
    const didFileData = flags.pretty ? JSON.stringify(didDoc, null, 4) : JSON.stringify(didDoc);
    files.push({
        path: didFileName,
        relative: true,
        data: didFileData,
    });

    // add any key pairs requested
    if (keyNames.length > 0) {
        const kids = keyNames.map(n => `${didDoc.id}#${n}`);
        for (let i = 0; i < keyPairs.length; i++) {
            const kp = keyPairs[i];
            const keyName = kp.kid.replace(didDoc.id + '#', '');
            
            if (kids.includes(kp.kid)) {
                // add private key
                const privKeyName =  `${exportFolder}/${keyName}.private.jwk`;
                const privKeyData = flags.pretty ? JSON.stringify(kp.private, null, 4) : JSON.stringify(kp.private);
                files.push({
                    path: privKeyName,
                    relative: true,
                    data: privKeyData,
                });

                // add public key if present
                if (typeof kp.public !== 'undefined') {
                    const pubKeyName =  `${exportFolder}/${keyName}.public.jwk`;
                    const pubKeyData = flags.pretty ? JSON.stringify(kp.public, null, 4) : JSON.stringify(kp.public);
                    files.push({
                        path: pubKeyName,
                        relative: true,
                        data: pubKeyData,
                    });
                }
            }
        }
    }


    const exportFiles = await createFiles(files);

    if (exportFiles.success) {
        oraSave.succeed(`${exportFiles.message}\nExported identity: ${JSON.stringify(exportFiles.files, null, 4)}`);
    } else {
        oraSave.fail(exportFiles.message);
    }
  }
}
