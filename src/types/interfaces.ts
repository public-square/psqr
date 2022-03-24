export interface DataResponse {
    success: boolean;
    message: string;
    data?: any;
}

export interface ListResponse {
    success: boolean;
    message: string;
    items: DataResponse[];
}

export interface BroadcastConfig {
    broadcaster: string;
    selfSigned?: boolean;
}

export interface IndexConfig {
    indexer: string;
    selfSigned?: boolean;
}

export type ProxyConfig = false | {
    host: string;
    port: number;
    auth: string;
}
