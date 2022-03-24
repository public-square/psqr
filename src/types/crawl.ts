import {Record, Number, String, Literal} from 'runtypes';
import {CrawlFilters, KID, Url, ValueFilters} from './base-types';

const Crawl = Record({
    kid: KID,
    type: String,
    defaults: Record({
        geo: String.optional(),
        politicalSubdivision: String.optional(),
        lang: String.optional(),
        image: String.optional(),
    }),
    lastPost: String,
    filters: Record({
        crawl: CrawlFilters,
        value: ValueFilters,
    }).optional(),
});

const RSS = Crawl.And(Record({
    type: Literal('rss'),
    url: Url,
    etag: String,
}));

const Twitter = Crawl.And(Record({
    type: Literal('twitter'),
    username: String,
    userId: Number,
    lastTweet: String,
}));

const Webhose = Crawl.And(Record({
    type: Literal('webhose'),
    url: Url,
}));

const Sitemap = Crawl.And(Record({
    type: Literal('sitemap'),
    url: Url,
    since: String,
}));

export {RSS, Twitter, Webhose, Sitemap, Crawl}
