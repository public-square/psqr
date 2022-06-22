import {Record, String, Array as ArrayType} from 'runtypes';
import {DID, KID, Url} from './base-types';

/** Service Endpoint */
const ServiceEndpoint = Record({
    url: Url,
})

/** Network Configuration for Content and Services */
const NetworkConfig = Record({
    name: String,
    domain: String,
    identityDomains: ArrayType(DID),
    content: Record({
        search: ServiceEndpoint,
        list: ServiceEndpoint,
        feed: ServiceEndpoint,
        link: ServiceEndpoint,
        beacon: ServiceEndpoint,
    }),
    services: Record({
        api: ServiceEndpoint,
    }),
})

/** Network Granted Permissions to KID */
const NetPermGrant = Record({
    kid: KID,
    grant: ArrayType(String),
})

/** Network Permissions granted to Domain */
const NetworkPermissions = Record({
    domain: String,
    url: Url,
    grants: ArrayType(NetPermGrant),
})

export {NetworkConfig, NetworkPermissions}
