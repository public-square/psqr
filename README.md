psqr
====

CLI client for the Public Square project

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/psqr.svg)](https://npmjs.org/package/psqr)
[![Downloads/week](https://img.shields.io/npm/dw/psqr.svg)](https://npmjs.org/package/psqr)
[![License](https://img.shields.io/npm/l/psqr.svg)](https://github.com/newpress/public-square-client-cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g psqr
$ psqr COMMAND
running command...
$ psqr (-v|--version|version)
psqr/0.1.1 linux-x64 node-v16.2.0
$ psqr --help [COMMAND]
USAGE
  $ psqr COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`psqr config:export [DID]`](#psqr-configexport-did)
* [`psqr config:import [PATH]`](#psqr-configimport-path)
* [`psqr crawl [TYPE] [DID]`](#psqr-crawl-type-did)
* [`psqr crawl:add:rss [KID] [URL]`](#psqr-crawladdrss-kid-url)
* [`psqr crawl:add:sitemap [KID] [URL]`](#psqr-crawladdsitemap-kid-url)
* [`psqr crawl:add:twitter [KID] [USERNAME]`](#psqr-crawladdtwitter-kid-username)
* [`psqr crawl:add:webhose [KID] [USERNAME]`](#psqr-crawladdwebhose-kid-username)
* [`psqr crawl:default [TYPE] [DID]`](#psqr-crawldefault-type-did)
* [`psqr crawl:publish [TYPE] [DID]`](#psqr-crawlpublish-type-did)
* [`psqr crawl:pull [TYPE] [DID]`](#psqr-crawlpull-type-did)
* [`psqr crawl:remove [TYPE] [DID]`](#psqr-crawlremove-type-did)
* [`psqr crawl:test [TYPE] [DID]`](#psqr-crawltest-type-did)
* [`psqr env [FILE]`](#psqr-env-file)
* [`psqr help [COMMAND]`](#psqr-help-command)
* [`psqr identity [KID]`](#psqr-identity-kid)
* [`psqr identity:add [KID]`](#psqr-identityadd-kid)
* [`psqr identity:create [KID]`](#psqr-identitycreate-kid)
* [`psqr identity:default [KID]`](#psqr-identitydefault-kid)
* [`psqr identity:delete [DID]`](#psqr-identitydelete-did)
* [`psqr identity:export [DID]`](#psqr-identityexport-did)
* [`psqr identity:new [KID]`](#psqr-identitynew-kid)
* [`psqr identity:propagate [DID]`](#psqr-identitypropagate-did)
* [`psqr identity:resolve [DID]`](#psqr-identityresolve-did)
* [`psqr identity:validate [KID] [PATH]`](#psqr-identityvalidate-kid-path)
* [`psqr key:add [KID]`](#psqr-keyadd-kid)
* [`psqr key:new [DID] [NAMES]`](#psqr-keynew-did-names)
* [`psqr network`](#psqr-network)
* [`psqr network:create [DOMAIN] [NAME]`](#psqr-networkcreate-domain-name)
* [`psqr network:default [DOMAINS]`](#psqr-networkdefault-domains)
* [`psqr network:remove [DOMAINS]`](#psqr-networkremove-domains)
* [`psqr post [BODY]`](#psqr-post-body)
* [`psqr post:create [BODY]`](#psqr-postcreate-body)
* [`psqr post:put [HASH] [DATA]`](#psqr-postput-hash-data)
* [`psqr post:sign [DATA]`](#psqr-postsign-data)
* [`psqr search [QUERY]`](#psqr-search-query)
* [`psqr setup`](#psqr-setup)

## `psqr config:export [DID]`

Export the full configuration for a specified DID

```
USAGE
  $ psqr config:export [DID]

ARGUMENTS
  DID  DID of the identity that you want to export

OPTIONS
  -h, --help             show CLI help
  -n, --network=network  domain of network to export instead of using default
```

_See code: [src/commands/config/export.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/config/export.ts)_

## `psqr config:import [PATH]`

Import a config and set as default if specified

```
USAGE
  $ psqr config:import [PATH]

ARGUMENTS
  PATH  path to file containing the config you want to import

OPTIONS
  -d, --default  Set config values as the default in all cases
  -d, --key=key  Key name to use as default, if not specified the first available key will be used
  -h, --help     show CLI help
```

_See code: [src/commands/config/import.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/config/import.ts)_

## `psqr crawl [TYPE] [DID]`

Crawl new Posts from feeds and publish them.

```
USAGE
  $ psqr crawl [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the identity that you want to crawl

OPTIONS
  -b, --broadcasters=broadcasters  Comma (,) separated list of domains of Broadcaster(s) to publish to instead of the
                                   defaults

  -h, --help                       show CLI help

  -p, --proxy                      Use a proxy for each request

  -s, --stdin                      Use STDIN input as a list of newline separated DIDs. They are assumed to all be the
                                   same type.

DESCRIPTION
  Don't specify any arguments in order to use the defaults.
  If you want to crawl multiple configs use stdin or set them as the defaults.
```

_See code: [src/commands/crawl.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl.ts)_

## `psqr crawl:add:rss [KID] [URL]`

Create a new RSS Crawl config

```
USAGE
  $ psqr crawl:add:rss [KID] [URL]

ARGUMENTS
  KID  DID and Key to be used for posts
  URL  Url to RSS feed

OPTIONS
  -g, --geo=geo                                    Specify the default geo value
  -h, --help                                       show CLI help
  -i, --image=image                                Specify the default image value
  -l, --lang=lang                                  Specify the default lang value
  -p, --politicalSubdivision=politicalSubdivision  Specify the default politicalSubdivision value
```

_See code: [src/commands/crawl/add/rss.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/add/rss.ts)_

## `psqr crawl:add:sitemap [KID] [URL]`

Create or update a Sitemap crawl config

```
USAGE
  $ psqr crawl:add:sitemap [KID] [URL]

ARGUMENTS
  KID  DID and Key to be used for posts
  URL  url for sitemap

OPTIONS
  -d, --filterDescription=filterDescription        List of descriptions to never use divided by the pipe symbol (|).
  -e, --filterImage=filterImage                    List of images to never use divided by the pipe symbol (|).
  -g, --geo=geo                                    Specify the default geo value
  -h, --help                                       show CLI help
  -i, --image=image                                Specify the default image value
  -l, --lang=lang                                  Specify the default lang value

  -m, --markupInclude=markupInclude                List of markup tags divided by the pipe symbol (|). Include only
                                                   these markup tags

  -n, --markupExclude=markupExclude                List of markup tags divided by the pipe symbol (|). Include
                                                   everything but these markup tags

  -p, --politicalSubdivision=politicalSubdivision  Specify the default politicalSubdivision value

  -q, --pathInclude=pathInclude                    List of paths divided by the pipe symbol (|). Include only urls with
                                                   this path

  -r, --pathExclude=pathExclude                    List of paths divided by the pipe symbol (|). Include every url
                                                   except for those with this path

  -s, --since=since                                [default: 1d] Include all posts that have been created since now -
                                                   this flag. This filters based on lastmod and defaults to 1d. Set to 0
                                                   to skip.

  -t, --filterTitle=filterTitle                    List of titles to never use divided by the pipe symbol (|).
```

_See code: [src/commands/crawl/add/sitemap.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/add/sitemap.ts)_

## `psqr crawl:add:twitter [KID] [USERNAME]`

Create a new Twitter Crawl config

```
USAGE
  $ psqr crawl:add:twitter [KID] [USERNAME]

ARGUMENTS
  KID       DID and Key to be used for posts
  USERNAME  @ username for Twitter user

OPTIONS
  -g, --geo=geo                                    Specify the default geo value
  -h, --help                                       show CLI help
  -i, --image=image                                Specify the default image value
  -l, --lang=lang                                  Specify the default lang value
  -p, --politicalSubdivision=politicalSubdivision  Specify the default politicalSubdivision value
```

_See code: [src/commands/crawl/add/twitter.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/add/twitter.ts)_

## `psqr crawl:add:webhose [KID] [USERNAME]`

Create a new Webhose Crawl config

```
USAGE
  $ psqr crawl:add:webhose [KID] [USERNAME]

ARGUMENTS
  KID       DID and Key to be used for posts
  USERNAME  @ username for Webhose user

OPTIONS
  -d, --domain=domain                              (required) Specify the domain for the webhose url
  -g, --geo=geo                                    Specify the default geo value
  -h, --help                                       show CLI help
  -i, --image=image                                Specify the default image value
  -l, --lang=lang                                  Specify the default lang value
  -p, --politicalSubdivision=politicalSubdivision  Specify the default politicalSubdivision value
```

_See code: [src/commands/crawl/add/webhose.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/add/webhose.ts)_

## `psqr crawl:default [TYPE] [DID]`

Set the default Crawl(s)

```
USAGE
  $ psqr crawl:default [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the identity that you want to crawl

OPTIONS
  -h, --help       show CLI help
  -o, --overwrite  Overwrite the current defaults with specified Crawl(s)
  -s, --stdin      Use STDIN input as a list of newline separated DIDs.

DESCRIPTION
  Default behavior is to add specified Crawl(s) to defaults.
```

_See code: [src/commands/crawl/default.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/default.ts)_

## `psqr crawl:publish [TYPE] [DID]`

Publish posts stored with and Crawler.

```
USAGE
  $ psqr crawl:publish [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the identity that you want to crawl

OPTIONS
  -b, --broadcasters=broadcasters  Colon (:) separated list of domains of Broadcaster(s) to publish to instead of the
                                   defaults

  -h, --help                       show CLI help

  -k, --keep                       Keep the posts stored with the crawler once they have been published

  -s, --stdin                      Use STDIN input as a list of newline separated DIDs.

DESCRIPTION
  All posts that are in the posts dir of the Crawler will be signed,
  published to the broadcasters, and then deleted unless otherwise specified.
```

_See code: [src/commands/crawl/publish.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/publish.ts)_

## `psqr crawl:pull [TYPE] [DID]`

Crawl new Posts from feeds.

```
USAGE
  $ psqr crawl:pull [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the identity that you want to crawl

OPTIONS
  -h, --help   show CLI help
  -l, --local  Save all the posts in the current directory instead of the crawl dir
  -p, --proxy  Use a proxy for each request
  -s, --stdin  Use STDIN input as a list of newline separated DIDs. They are assumed to all be the same type.

DESCRIPTION
  Don't specify any arguments in order to use the defaults.
  If you want to crawl multiple configs use stdin or set them as the defaults.
  New posts from all feeds are retrieved and stored in their feed directories
  or locally if specified.
```

_See code: [src/commands/crawl/pull.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/pull.ts)_

## `psqr crawl:remove [TYPE] [DID]`

Remove Crawl configs.

```
USAGE
  $ psqr crawl:remove [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the crawl config that you want to remove

OPTIONS
  -h, --help   show CLI help
  -s, --stdin  Use STDIN input as a list of newline separated DIDs.
```

_See code: [src/commands/crawl/remove.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/remove.ts)_

## `psqr crawl:test [TYPE] [DID]`

Run a test Crawl to verify the information gathered is accurate.

```
USAGE
  $ psqr crawl:test [TYPE] [DID]

ARGUMENTS
  TYPE  (rss|twitter|webhose|sitemap) The type of crawl you want to use
  DID   DID of the identity that you want to crawl

OPTIONS
  -c, --complete  Include complete post json instead of just meta info.
  -d, --dataOnly  Only output source data used to form posts.
  -h, --help      show CLI help
  -l, --list      Output as a jsonl file instead of a human readable json array.
  -p, --proxy     Use a proxy for each request
  -s, --stdin     Use STDIN input as a list of newline separated DIDs. They are assumed to all be the same type.
  -u, --urlOnly   Only output list of canonicalUrls.

DESCRIPTION
  Output normally includes post.info.publicSquare.package only as json array.
  Output is saved as a local file(s) with the name crawl-test-{ level }-{ path valid did}-{ timestamp }.json(l) 
  depending on options selected.
```

_See code: [src/commands/crawl/test.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/crawl/test.ts)_

## `psqr env [FILE]`

View or set psqr environment vars. If a valid env [FILE] is specified it will replace the current env and be saved.

```
USAGE
  $ psqr env [FILE]

ARGUMENTS
  FILE  path to file containing env vars for the default cli environment

OPTIONS
  -g, --get=get   Get specific saved env vars. Format is comma separated key
  -h, --help      show CLI help
  -l, --list      List current env vars and their values
  -p, --possible  List all possible env vars
  -s, --set=set   Set and save specific env vars. Format is comma separated key=value
```

_See code: [src/commands/env.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/env.ts)_

## `psqr help [COMMAND]`

display help for psqr

```
USAGE
  $ psqr help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.3.1/src/commands/help.ts)_

## `psqr identity [KID]`

List saved identities. 

```
USAGE
  $ psqr identity [KID]

ARGUMENTS
  KID  KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}

OPTIONS
  -a, --all      Include all possible keys
  -d, --default  List the Default Identity
  -h, --help     show CLI help
  -v, --verbose  Output only the raw Identity object

DESCRIPTION
  This command lists the identities that are currently saved and available.
```

_See code: [src/commands/identity.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity.ts)_

## `psqr identity:add [KID]`

Add a pre-existing identity to the cli config and create a new key.

```
USAGE
  $ psqr identity:add [KID]

ARGUMENTS
  KID  KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}

OPTIONS
  -a, --absolute   Key directory path is an absolute path
  -h, --help       show CLI help

  -p, --path=path  Instead of generating a new key, use the keys from this directory. Expected files are private.jwk and
                   public.jwk

  -s, --stdin      Use STDIN input as KeyPair. Expected JSON string format: { kid, private, public }

DESCRIPTION
  This assumes the DID is located at the url specified in the KID url string.
  If you have some pre-existing keys that you want to add you can either specify the path to them with --path,
  or pass the entire KeyPair as a JSON string with --stdin.
```

_See code: [src/commands/identity/add.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/add.ts)_

## `psqr identity:create [KID]`

Create a new identity from a provided KID and add it to the psqr config.

```
USAGE
  $ psqr identity:create [KID]

ARGUMENTS
  KID  KID string, expected format: did:psqr:{hostname}/{path}#{keyId}

OPTIONS
  -b, --bio=bio                  publicIdentity bio
  -d, --description=description  publicIdentity description
  -h, --help                     show CLI help
  -i, --image=image              publicIdentity image url
  -k, --keys=keys                List of comma separated key names to create. Overrides keyId from end of KID
  -l, --local                    Store the identity locally instead of in the psqr config
  -n, --name=name                publicIdentity name, REQUIRED if no STDIN input
  -s, --stdin                    Use STDIN input as full JSON publicIdentity string
  -t, --tagline=tagline          publicIdentity tagline
  -u, --url=url                  publicIdentity url

DESCRIPTION
  This only supports creating did:psqr identities.
```

_See code: [src/commands/identity/create.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/create.ts)_

## `psqr identity:default [KID]`

Set the default identity using the KID

```
USAGE
  $ psqr identity:default [KID]

ARGUMENTS
  KID  KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/identity/default.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/default.ts)_

## `psqr identity:delete [DID]`

Remove an Identity from a Public Square Network that hosts Identities.

```
USAGE
  $ psqr identity:delete [DID]

ARGUMENTS
  DID  DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/identity/delete.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/delete.ts)_

## `psqr identity:export [DID]`

Export the did doc of an identity.

```
USAGE
  $ psqr identity:export [DID]

ARGUMENTS
  DID  DID of the identity that you want to export, skip for default

OPTIONS
  -h, --help       show CLI help
  -k, --keys=keys  Comma separated list of key names to export. THIS WILL EXPORT PRIVATE KEYS.
  -p, --pretty     Pretty-print the exported identity doc

DESCRIPTION
  If you wish to export your stored private keys you need to specify each key by name.
```

_See code: [src/commands/identity/export.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/export.ts)_

## `psqr identity:new [KID]`

Create a new default identity

```
USAGE
  $ psqr identity:new [KID]

ARGUMENTS
  KID  KID URL string, expected format: did:psqr:{hostname}/{path}#{keyId}

OPTIONS
  -b, --bio=bio                  publicIdentity bio
  -d, --description=description  publicIdentity description
  -h, --help                     show CLI help
  -i, --image=image              publicIdentity image url
  -n, --name=name                publicIdentity name, REQUIRED if no STDIN input
  -s, --stdin                    Use STDIN input as full JSON publicIdentity string
  -t, --tagline=tagline          publicIdentity tagline
  -u, --url=url                  publicIdentity url

DESCRIPTION
  This command creates a new identity from a provided KID URL,
  adds it to the psqr config, and sets it as the default.
  This only supports creating did:psqr identities.
```

_See code: [src/commands/identity/new.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/new.ts)_

## `psqr identity:propagate [DID]`

Propagate an Identity to a Public Square Network that hosts Identities.

```
USAGE
  $ psqr identity:propagate [DID]

ARGUMENTS
  DID  DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}

OPTIONS
  -h, --help  show CLI help

DESCRIPTION
  It will use any available admin key associated with the identity or it will throw an error if none are available.
```

_See code: [src/commands/identity/propagate.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/propagate.ts)_

## `psqr identity:resolve [DID]`

For Self Hosting the Identity, find the local file and the URL that must serve it.

```
USAGE
  $ psqr identity:resolve [DID]

ARGUMENTS
  DID  DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/identity/resolve.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/resolve.ts)_

## `psqr identity:validate [KID] [PATH]`

Validate an identity (DID doc and key pair)

```
USAGE
  $ psqr identity:validate [KID] [PATH]

ARGUMENTS
  KID   KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}

  PATH  Path to directory containing keys in the form of a JWK, expected algorithm: ES384. Expected files are
        private.jwk and public.jwk

OPTIONS
  -a, --absolute  Key PATH is an absolute path
  -h, --help      show CLI help
  -r, --raw       Key PATH specified is raw (not a filepath), you need to escape "
  -s, --stdin     Use STDIN input as key instead of key PATH
```

_See code: [src/commands/identity/validate.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/identity/validate.ts)_

## `psqr key:add [KID]`

Add a pre-existing Key to an identity stored in the cli config.

```
USAGE
  $ psqr key:add [KID]

ARGUMENTS
  KID  KID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}

OPTIONS
  -a, --absolute   Key directory path is an absolute path
  -h, --help       show CLI help
  -p, --path=path  Use the keys from this directory. Expected files are private.jwk and public.jwk
  -s, --stdin      Use STDIN input as KeyPair. Expected JSON string format: { kid, private, public }

DESCRIPTION
  Specify the path to the directory containing them with --path,
  or pass the entire KeyPair as a JSON string with --stdin.
```

_See code: [src/commands/key/add.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/key/add.ts)_

## `psqr key:new [DID] [NAMES]`

Create new Keys and add them to a pre-existing identity.

```
USAGE
  $ psqr key:new [DID] [NAMES]

ARGUMENTS
  DID    DID URL string, expected format: did:(psqr|web):{hostname}(/|:){path}
  NAMES  Comma (,) separated list of names of keys to create

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/key/new.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/key/new.ts)_

## `psqr network`

List Network config

```
USAGE
  $ psqr network

OPTIONS
  -a, --all              List all current Network configs
  -d, --domains=domains  Colon (:) separated list of domains of specific Network(s) to list
  -h, --help             show CLI help
  -r, --raw              Output only the raw Network config

DESCRIPTION
  Lists the config of the Network(s) as specified by flags.
  Lists the defaults if not otherwise specified.
```

_See code: [src/commands/network.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/network.ts)_

## `psqr network:create [DOMAIN] [NAME]`

Create a new Network config

```
USAGE
  $ psqr network:create [DOMAIN] [NAME]

ARGUMENTS
  DOMAIN  Root domain of the network
  NAME    Friendly name to reference this Network

OPTIONS
  -a, --api=api        Url to use instead of api default ([domain]/api)
  -b, --beacon=beacon  Url to use instead of beacon default (beacon.[domain])
  -f, --feed=feed      Url to use instead of feed default (feed.[domain])
  -h, --help           show CLI help
  -i, --link=link      Url to use instead of link default (link.[domain])
  -l, --list=list      Url to use instead of list default (list.[domain])
  -s, --search=search  Url to use instead of search default (search.[domain])
```

_See code: [src/commands/network/create.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/network/create.ts)_

## `psqr network:default [DOMAINS]`

Set the default Network(s)

```
USAGE
  $ psqr network:default [DOMAINS]

ARGUMENTS
  DOMAINS  Colon (:) separated list of Network(s) to set as default

OPTIONS
  -h, --help       show CLI help
  -o, --overwrite  Overwrite the current defaults with specified Network(s)

DESCRIPTION
  Default behavior is to add specified Network(s) to defaults.
```

_See code: [src/commands/network/default.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/network/default.ts)_

## `psqr network:remove [DOMAINS]`

Remove Network configs

```
USAGE
  $ psqr network:remove [DOMAINS]

ARGUMENTS
  DOMAINS  Colon (:) separated list of Network(s) to remove

OPTIONS
  -h, --help  show CLI help
```

_See code: [src/commands/network/remove.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/network/remove.ts)_

## `psqr post [BODY]`

Create post, sign it with specified key, and publish to Broadcaster

```
USAGE
  $ psqr post [BODY]

ARGUMENTS
  BODY  Relative path to body data file or JSON body data

OPTIONS
  -b, --broadcasters=broadcasters                  Colon (:) separated list of domains of Broadcaster(s) to put to
  -c, --canonicalUrl=canonicalUrl                  Post canonical url
  -e, --description=description                    Post description
  -g, --geo=geo                                    Post geo
  -h, --help                                       show CLI help
  -i, --image=image                                Post image
  -k, --kid=kid                                    KID string
  -l, --lang=lang                                  Post language, can be set in env
  -o, --politicalSubdivision=politicalSubdivision  Post political subdivision
  -p, --publishDate=publishDate                    Post publish date
  -r, --raw                                        DATA specified is raw (not a filepath), you need to escape "
  -s, --stdin                                      Use STDIN input as DATA
  -t, --title=title                                Post title
```

_See code: [src/commands/post.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/post.ts)_

## `psqr post:create [BODY]`

Create Post JSON with input data

```
USAGE
  $ psqr post:create [BODY]

ARGUMENTS
  BODY  Relative path to body data file or JSON body data

OPTIONS
  -c, --canonicalUrl=canonicalUrl                  Post canonical url
  -e, --description=description                    Post description
  -g, --geo=geo                                    Post geo
  -h, --help                                       show CLI help
  -i, --image=image                                Post image
  -k, --kid=kid                                    KID string, can be set in env
  -l, --lang=lang                                  Post language, can be set in env
  -o, --politicalSubdivision=politicalSubdivision  Post political subdivision
  -p, --publishDate=publishDate                    Post publish date
  -r, --raw                                        DATA specified is raw (not a filepath), you need to escape "
  -s, --stdin                                      Use STDIN input as DATA
  -t, --title=title                                Post title
```

_See code: [src/commands/post/create.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/post/create.ts)_

## `psqr post:put [HASH] [DATA]`

Publish content to the specified Broadcaster

```
USAGE
  $ psqr post:put [HASH] [DATA]

ARGUMENTS
  HASH  infoHash of the post to be published
  DATA  Relative path to signed post content as a JWS or JSON post data, expected format: {config: JWS}

OPTIONS
  -b, --broadcasters=broadcasters  Colon (:) separated list of domains of Broadcaster(s) to put to instead of the
                                   defaults

  -h, --help                       show CLI help

  -r, --raw                        DATA specified is raw (not a filepath), you need to escape "

  -s, --stdin                      Use STDIN input as DATA
```

_See code: [src/commands/post/put.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/post/put.ts)_

## `psqr post:sign [DATA]`

Parse post JSON and sign it with specified key

```
USAGE
  $ psqr post:sign [DATA]

ARGUMENTS
  DATA  Relative path to post file or JSON post data

OPTIONS
  -h, --help     show CLI help
  -k, --kid=kid  KID string
  -r, --raw      DATA specified is raw (not a filepath), you need to escape "
  -s, --stdin    Use STDIN input as DATA
```

_See code: [src/commands/post/sign.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/post/sign.ts)_

## `psqr search [QUERY]`

Search ElasticSearch for a specific string

```
USAGE
  $ psqr search [QUERY]

ARGUMENTS
  QUERY  String that you want to search

OPTIONS
  -b, --body               Return only the source body from the response object
  -h, --help               show CLI help
  -i, --indexers=indexers  Colon (:) separated list of domains of Indexer(s) to search
  -m, --nometa             Remove metainfo from the response object
  -p, --page=page          ElasticSearch page to query, defaults to 1
  -r, --raw                Output only the raw responses
```

_See code: [src/commands/search.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/search.ts)_

## `psqr setup`

This utility will prompt you for the all of the necessary info to get your environment up and running.

```
USAGE
  $ psqr setup

OPTIONS
  -h, --help  show CLI help

DESCRIPTION
  It will set up your identity, keys, necessary networking, and any content crawling configuration you may need.
```

_See code: [src/commands/setup.ts](https://github.com/newpress/public-square-client-cli/blob/v0.1.1/src/commands/setup.ts)_
<!-- commandsstop -->
