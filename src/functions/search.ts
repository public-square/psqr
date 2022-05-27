const axios = require('axios').default;
const https = require('https');

import { Static } from 'runtypes';
import { ListResponse, IndexConfig } from '../types/interfaces'
import { NetworkConfig } from '../types/network';
import { getNetworkConfig } from './network';
import { handleRuntypeFail } from './utility';

export interface ESConfig extends IndexConfig {
    page: number;
}

/**
 * Search ElasticSearch Indices for specified string.
 * If no Indexers are specified, the default Indexers
 * will be used.
 *
 * @param query string to search for
 * @param config configuration for ES to be searched
 * @returns search results
 */
async function searchES(query: string, config: ESConfig): Promise<ListResponse> {
    // get array of indexers to send post to
    let iResp;
    const domains = config.indexer;
    if (domains === null || domains === '') {
        // use default indexers if none specified
        iResp = await getNetworkConfig()
    } else {
        iResp = await getNetworkConfig(domains)
    }
    if (iResp.success === false) return {
        success: false,
        message: iResp.message,
        items: [],
    }

    // allow self-signed certs if specified
    if (config.selfSigned === true) {
        const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
        });
        axios.defaults.httpsAgent = httpsAgent;
    }

    // assemble request
    const data = {
        term: query,
        page: config.page,
    }

    // we only need the indexer configs
    const indexers: Static<typeof NetworkConfig>[] = iResp.data;

    // loop through indexers and create query promises
    const searches = [];
    for (let i = 0; i < indexers.length; i++) {
        try {
            // assemble search url
            const sc = indexers[i].services.api.url;
            const url = `${sc}/search`;

            const query = axios({
                id: indexers[i].domain,
                url,
                method: 'POST',
                data,
            });

            // include all searches
            searches.push(query)
        } catch (error: any) {
            const msg = handleRuntypeFail(error);
            const resp = {
                success: false,
                message: msg,
                items: [],
            }

            return resp;
        }
    }

    // once all queries have been returned or it fails, return a response
    return Promise.allSettled(searches).then(value => {
        const items = value.map(v => {
            if (v.status === 'rejected') {
                return {
                    success: false,
                    message: v.reason.config.id,
                    data: v.reason.message,
                }
            }
            return {
                success: true,
                message: v.value.config.id,
                data: v.value.data,
            }
        });

        return {
            success: true,
            message: 'Successfully queried ES',
            items,
        }
    });
}

export { searchES };
