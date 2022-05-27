/** Data Response Succcess/Failure Message */
export interface DataResponse {
    success: boolean;
    message: string;
    data?: any;
}

/** List Response Succcess/Failure Message */
export interface ListResponse {
    success: boolean;
    message: string;
    items: DataResponse[];
}

/** Broadcaster Config */
export interface BroadcastConfig {
    broadcaster: string;
    selfSigned?: boolean;
}

/** Indexer Config */
export interface IndexConfig {
    indexer: string;
    selfSigned?: boolean;
}

/** Proxy Config */
export type ProxyConfig = false | {
    host: string;
    port: number;
    auth: string;
}
