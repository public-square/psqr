import { Record, Array as ArrayType, Number, String } from 'runtypes';
import { Url } from './base-types';

import { PublicKey, PublicInfo } from './identity';

const publicSquare = Record({
    package: Record({
        geo: String,
        politicalSubdivison: String,
        publishDate: Number,
        lang: String,
        title: String,
        description: String,
        image: String,
        body: String,
        canonicalUrl: Url,
        references: Record({
            content: Record({
                reply: String,
                amplify: String,
                like: String,
            }),
        }),
    }),
});

const provenance = Record({
    signature: String,
    jwk: PublicKey,
    publisher: PublicInfo,
});

const file = Record({
    name: String,
    offset: Number,
    length: String,
});

const Post = Record({
    name: String,
    infoHash: String,
    created: Number,
    createdBy: String,
    urlList: ArrayType(String),
    announce: ArrayType(String),
    files: ArrayType(file),
    provenance: provenance,
    info: Record({
        publicSquare: publicSquare,
    }),
});

const PostSkeleton = Record({
    body: String,
    description: String,
    lang: String,
    publishDate: Number,
    title: String,
    geo: String,
    politicalSubdivision: String,
    image: String,
    canonicalUrl: Url,
    reply: String.optional(),
});

const JwsPost = Record({
    token: String.withConstraint(
        str => /[\d\w-]+\.[\d\w-]+\.[\d\w-]+/g.test(str) || 'Invalid JWS specified'
    ),
})

export { Post, PostSkeleton, JwsPost }
