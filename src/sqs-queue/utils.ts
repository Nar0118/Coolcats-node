import { Environment } from '../environment'
import _ from 'lodash'
import * as ethers from 'ethers'
import {
    cacheKeyTTL,
    parseAbi,
    getNextNonce,
    cacheTTL,
    oneAtATimeSegmented,
    parseUnits,
    isProd,
    type SecondaryPriceOpinionBigNumber,
    type SecondaryPriceOpinion,
    type PriceOpinion,
} from '../utility/util'
import fetch from 'node-fetch'

import {BlockchainContract} from '../entity/blockchain-contract'
import {getRepository} from 'typeorm'

export const getContract = cacheKeyTTL(30 * 1000, async (code: string) => {
    const blockchainRepository = getRepository<BlockchainContract>(BlockchainContract);
    const contract = await blockchainRepository.findOne({
        where: {
            code,
            mode: Environment.env.MODE,
        }
    })
    if (!contract) {
        throw new Error(`Could not resolve contract ${code}`)
    }
    return {
        ...contract,
        parsedAbi: parseAbi(contract.abi),
        providers: contract.provider.split('|')
            .map(provider => provider.trim())
            .filter(provider => provider),
    }
})
const convertPriceInfoToBigNumber = ({
    maxPriorityFee,
    maxFee,
}: SecondaryPriceOpinion): SecondaryPriceOpinionBigNumber<SecondaryPriceOpinion> => ({
    maxPriorityFee: parseUnits(maxPriorityFee, 9),
    maxFee: parseUnits(maxFee, 9),
})

// 3 seconds is close to the upper bound of a polygon block time
const devUrl = 'https://gasstation-mumbai.matic.today/v2'
const prodUrl = 'https://gasstation-mainnet.matic.network/v2'
export const gasProvider = cacheTTL(2 * 1000, async (): Promise<PriceOpinion> => {
    const url = isProd ? prodUrl : devUrl
    const req = await fetch(url)
    const result = await req.json()
    console.log(
        (new Date()).toISOString(),
        'secondary fee data refreshed',
        parseUnits(result.fast.maxFee, 9).toString(),
        parseUnits(result.fast.maxPriorityFee, 9).toString(),
    )
    return {
        ...result,
        estimatedBaseFee: parseUnits(result.estimatedBaseFee, 9),
        safeLow: convertPriceInfoToBigNumber(result.safeLow),
        standard: convertPriceInfoToBigNumber(result.standard),
        fast: convertPriceInfoToBigNumber(result.fast),
    }
})

export const getNextNonceForMessage = oneAtATimeSegmented(async (
    handler: { _nonce: number; },
    signer: ethers.Signer,
    refresh: boolean | undefined,
) => {
    const existing = (refresh !== true ? handler._nonce : null)
    const nextNonce = typeof existing === 'number' ? existing : await getNextNonce(signer)
    handler._nonce = nextNonce
    return nextNonce
})

export type BaseMessage = {
    guid: string;
    type: string;
}

export const getProviderURL = (providers: string[]) => (
    providers.find((provider) => provider.includes('alchemy') && provider.includes('wss://')) ||
        providers.find((provider) => provider.includes('alchemy')) ||
        providers[0]
)

const createProvider = (providerURL: string) => {
    console.log('creating provider with url', providerURL)
    return providerURL.includes('wss') ?
        new ethers.providers.WebSocketProvider(providerURL) :
        new ethers.providers.JsonRpcBatchProvider(providerURL)
}
export const getProvider = cacheKeyTTL(10 * 60 * 1_000, (provider: string): ethers.providers.Provider => {
    if (!provider) {
        throw new Error(`no provider found ${provider}`)
    }
    return createProvider(provider)
})

const zero = ethers.BigNumber.from(0)

export const handleGasProviderError = (err: Error) => {
    console.error(err)
    const zeros = {
        maxFee: zero,
        maxPriorityFee: zero,
    }
    return {
        safeLow: zeros,
        standard: zeros,
        fast: zeros,
    }
}
