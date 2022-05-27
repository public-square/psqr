import { Record, Array as ArrayType, Number, String, Literal, Union } from 'runtypes';
import { DID, DID_PSQR, DID_WEB, KID, Url } from './base-types';

/** Public Cryptographic Key */
const PublicKey = Record({
    crv: Literal('P-384'),
    alg: Literal('ES384'),
    kty: Literal('EC'),
    kid: KID,
    x: String,
    y: String,
});

/** Private Cryptographic Key */
const PrivateKey = PublicKey.And(
    Record({
        d: String,
    })
);


/** Public Personal Information */
const PublicInfo = Record({
    name: String,
    image: String.optional(),
    url: Url.optional(),
    tagline: String.optional(),
    bio: String.optional(),
    description: String.optional(),
})

/** Decentralized Identity */
const Did = Record({
    '@context': ArrayType(Union(
        Literal('https://www.w3.org/ns/did/v1'),
        Literal('https://vpsqr.com/ns/did-psqr/v1')
    )),
    id: DID,
    psqr: Record({
        publicIdentity: PublicInfo,
        publicKeys: ArrayType(PublicKey),
        permissions: ArrayType(Record({
            kid: KID,
            grant: ArrayType(String),
        })),
        updated: Number.optional()
    })
})

/** Key Pair - DID with Key, Private and Public Keys */
const KeyPair = Record({
    kid: KID,
    private: PrivateKey,
    public: PublicKey.optional(),
})

/** Identity including Keypairs, DID and DidDocs */
const Identity = Record({
    did: DID,
    didDoc: Did,
    keyPairs: ArrayType(KeyPair),
})

export { PublicKey, PrivateKey, PublicInfo, Did, Identity, KeyPair };
