import {type Request} from 'express'

export enum Sort {
    ASC = 'asc',
    DESC = 'desc'
}

export type AuthenticatedRequest = Request & {
    embeddedAddress: string
    injectedAddress: string
    userId:string
}

export type NetworkRequest = Request & {
    network: string
}

export type AuthenticatedNetworkRequest = AuthenticatedRequest & NetworkRequest
