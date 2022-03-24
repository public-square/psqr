import {Record, String, Boolean, Literal, Union, Array as ArrayType} from 'runtypes';
import {DID, KID, Url} from './base-types';

const ServiceEndpoint = Record({
    url: Url,
})

const NetworkConfig = Record({
    name: String,
    domain: String,
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

const NetPermGrant = Record({
    kid: KID,
    grant: ArrayType(String),
})

const NetworkPermissions = Record({
    domain: String,
    url: Url,
    grants: ArrayType(NetPermGrant),
})

export {NetworkConfig, NetworkPermissions}
