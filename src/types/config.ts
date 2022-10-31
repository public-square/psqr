import { Record, String, Array as ArrayType, Number } from 'runtypes';
import { Url } from './base-types';
import { Identity } from './identity';
import { NetworkConfig, NetworkPermissions } from './network';
import { Post } from './post';

const FeedConfig = Record({
    name: String,
    slug: String,
    url: Url,
})

const ListArticle = Record({
    body: String,
    broadcastDate: Number,
    description: String,
    identity: String,
    key: String,
    infoHash: String,
    blindhash: Number,
    lang: String,
    metainfo: Post,
    publishDate: Number,
    title: String,
    geo: String,
    politicalSubdivision: String,
    contentAmplify: Number.optional(),
    contentLike: Number.optional(),
    contentReply: Number.optional(),
})

const List = Record({
    key: String,
    name: String,
    articles: ArrayType(ListArticle),
    url: Url,
})

const ListGroup = Record({
    name: String,
    lists: ArrayType(List),
})

const PsqrConfig = Record({
    name: String,
    identity: Identity,
    network: Record({
        config: NetworkConfig,
        permissions: ArrayType(NetworkPermissions),
    }).optional(),
    feeds: ArrayType(FeedConfig),
    lists: ArrayType(List),
    listGroups: ArrayType(ListGroup),
})

export { PsqrConfig }
