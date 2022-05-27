import {String, Record, Number, Array as ArrayType} from 'runtypes';

/** Validate URL String
 * @returns true or error message
*/
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

/** Validate Decentralized ID
 * @returns true or error message
*/
const DID = String.withConstraint(
    str => /did:(web|psqr):[A-Za-z0-9.\-_:/%]+$/g.test(str) || 'Invalid DID specified. Expected format: did:(psqr|web):{hostname}(/|:){path}'
);

/** Validate W3C Standard DID with WEB Method
 * @returns true or error message
*/
const DID_WEB = String.withConstraint(
    str => /did:web:[A-Za-z0-9.\-_:%]+$/g.test(str) || 'Invalid DID WEB specified. Expected format: did:web:{hostname}:{path}'
);

/** Validate W3C Standard DID with PSQR Method
 * @returns true or error message
*/
const DID_PSQR = String.withConstraint(
    str => /did:psqr:[A-Za-z0-9.\-_/%]+$/g.test(str) || 'Invalid DID PSQR specified. Expected format: did:psqr:{hostname}/{path}'
);

/** Validate W3C Standard DID with Key
 * @returns true or error message
*/
const KID = String.withConstraint(
    str => /did:(web|psqr):[A-Za-z0-9.\-_:/%]+#\w+$/g.test(str) || 'Invalid KID specified. Expected format: did:(psqr|web):{hostname}(/|:){path}#{keyId}'
);

/** Validate W3C Standard DID with WEB Method and Key
 * @returns true or error message
*/
const KID_WEB = String.withConstraint(
    str => /did:web:[A-Za-z0-9.\-_:%]+#\w+$/g.test(str) || 'Invalid KID WEB specified. Expected format: did:web:{hostname}:{path}#{keyId}'
);

/** Validate W3C Standard DID with PSQR Method and Key
 * @returns true or error message
*/
const KID_PSQR = String.withConstraint(
    str => /did:psqr:[A-Za-z0-9.\-_/%]+#\w+$/g.test(str) || 'Invalid KID PSQR specified. Expected format: did:psqr:{hostname}/{path}#{keyId}'
);

/** Fiters for the Crawler */
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

/** Value Filters (Replace Me) */
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

export {Url, DID, DID_PSQR, DID_WEB, KID, KID_PSQR, KID_WEB, CrawlFilters, ValueFilters}
