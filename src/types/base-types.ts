import {String, Record, Number, Array as ArrayType} from 'runtypes';

const Url = String.withConstraint(
    str => {
        try {
            const _url = new URL(str);
            return true;
        } catch (error) {
            return error.message
        }
    }
);

const DID = String.withConstraint(
    str => /did:(web|psqr):[A-Za-z0-9\.\-\_\/\%\:]+/g.test(str) || 'Invalid DID specified. Expected format: did:(psqr|web):{hostname}(/|:){path}'
);
const DID_WEB = String.withConstraint(
    str => /did:web(:[A-Za-z0-9\.\-\_\%]+)+$/g.test(str) || 'Invalid DID WEB specified. Expected format: did:web:{hostname}:{path}'
);
const DID_PSQR = String.withConstraint(
    str => /did:psqr:[A-Za-z0-9\.\-\_\/\%]+$/g.test(str) || 'Invalid DID PSQR specified. Expected format: did:psqr:{hostname}/{path}'
);

const KID = String.withConstraint(
    str => /did:(web|psqr):[A-Za-z0-9\.\-\_\/\%\:]+#\w+$/g.test(str) || 'Invalid KID specified. Expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}'
);

const CrawlFilters = Record({
    path: Record({
        includes: ArrayType(String).optional(),
        excludes: ArrayType(String).optional(),
    }).optional(),
    markup: Record({
        includes: ArrayType(String).optional(),
        excludes: ArrayType(String).optional(),
    }).optional(),
})

const ValueFilters = Record({
    body: ArrayType(String).optional(),
    description: ArrayType(String).optional(),
    lang: ArrayType(String).optional(),
    publishDate: ArrayType(Number).optional(),
    title: ArrayType(String).optional(),
    geo: ArrayType(String).optional(),
    politicalSubdivision: ArrayType(String).optional(),
    image: ArrayType(String).optional(),
    canonicalUrl: ArrayType(Url).optional(),
    reply: ArrayType(String).optional(),
})

export {Url, DID, DID_PSQR, DID_WEB, KID, CrawlFilters, ValueFilters}
