import { Record, String, Array as ArrayType } from 'runtypes';
import { Identity } from './identity';
import { NetworkConfig, NetworkPermissions } from './network';

const PsqrConfig = Record({
    name: String,
    identity: Identity,
    network: Record({
        config: NetworkConfig,
        permissions: ArrayType(NetworkPermissions),
    }),
})

export { PsqrConfig }
