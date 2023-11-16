/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import _ from 'lodash'
import BigNumber from 'bignumber.js'
import {IncomingMessage} from 'http';
import {getConnection, getRepository, Repository} from 'typeorm';
import {User} from '../entity/user';
import {UserProperty} from '../entity/user-property';
import {BlockchainContract} from '../entity/blockchain-contract';
import { EMode, Environment } from '../environment';
import {PusherService} from '../services/pusher.service';
import {KeyValue} from '../entity/key-value';
import {AWSError, CloudFront} from 'aws-sdk';
import {v4 as uuidv4, v5 as uuidv5} from 'uuid';
import {CreateInvalidationResult} from 'aws-sdk/clients/cloudfront';
// import * as newrelic from 'newrelic'
import * as Redis from 'redis'
import * as RedisMock from 'redis-mock'
import { ethers } from 'ethers';
import Timeout = NodeJS.Timeout;
import {Connection} from 'typeorm/connection/Connection';
import {CatGoldAward} from '../entity/cat-gold-award';
import {AdventureGoldAward} from '../entity/adventure-gold-award';
import {StakedPet} from '../entity/staked-pet';
import {GoldTransaction} from '../entity/gold-transaction';
import {Nonce} from '../entity/nonce';
import {PetUserItem} from '../entity/pet-user-item';
import {MarketplaceListing} from '../entity/marketplace-listing';
import {QuestHistory} from '../entity/quest-history';
import {QuestSelection} from '../entity/quest-selection';
import {QuestTheme} from '../entity/quest-theme';
import {QuestIo} from '../entity/quest-io';
import {PetInteraction} from '../entity/pet-interaction';
import {PetItem} from '../entity/pet-item';
import {PetType} from '../entity/pet-type';
import {PetCategory} from '../entity/pet-category';
import {TokenTransfer} from '../entity/token-transfer';
import {CoolcatOwner} from '../entity/coolcat-owner';
import {Coolpets} from '../entity/coolpets';
import {AbiItem, toAscii} from 'web3-utils';
import { encodeNonce } from '@0xsequence/transactions'

import Web3 from 'web3'
import * as AWS from 'aws-sdk'
import {IERC20} from "@coolcatsnft/milk-pets/artifacts/types/IERC20";
import { configureLogger } from '@0xsequence/utils';
import { Wallet } from '@0xsequence/wallet'
import { RpcRelayer } from '@0xsequence/relayer'
import { pusher as pusherService } from '../common'
import { EPusherEvent } from '../services/pusher.service'

Environment.merge()

configureLogger({
    // only log errors
    logLevel: 'ERROR',
})

export const isProd = Environment.env.MODE === EMode.PROD || Environment.env.MODE === EMode.STAGE

export const chainId = isProd ? 137 : 80001

export type TUserReferenceQuest = {
  element: number;
  questId: number;
  ioId: number;
}

export interface IContractWeb3 {
  contract: any,
  web3: Web3;
}

export interface IPetItemInteraction {
  from: string;
  itemTokenId: number;
  time: number;
}

export interface IMarketplaceListingData {
  seller: string;
  id: string;
  tokenId: string;
  amount: string;
  listingTime: string;
  price: string;
  listedPrice: string;
}

export enum ECacheKeys {
  NEXT_MILK_CLAIM = 'next-claim-time',
  MAX_CHAIN_CALLS_DAILY = 'max-chain-calls-daily',
  MUST_HAVE_PET_OR_CAT = 'must-have-pet-or-cat',
  IS_CONNECTED = 'is-user-connected'
}

export type GlobalTxOverwrites = {
    // rewrite to compartmentalize against type property
    type: number;
    gasPrice?: ethers.BigNumber;
    maxFeePerGas?: ethers.BigNumber;
    maxPriorityFeePerGas?: ethers.BigNumber;
}
export type TxOverwrites = GlobalTxOverwrites & {
    gasLimit: ethers.BigNumber;
}
export type SecondaryPriceOpinion = {
    maxPriorityFee: number;
    maxFee: number;
}
export type SecondaryPriceOpinionBigNumber<T> = {
    [P in keyof T]: ethers.BigNumber;
}
export type SecondaryPriceOpinionResponse = {
    safeLow: SecondaryPriceOpinion;
    standard: SecondaryPriceOpinion;
    fast: SecondaryPriceOpinion;
    estimatedBaseFee: number;
    blockTime: number;
    blockNumber: number;
}

export type PriceOpinion = SecondaryPriceOpinionResponse & {
    safeLow: SecondaryPriceOpinionBigNumber<SecondaryPriceOpinion>;
    standard: SecondaryPriceOpinionBigNumber<SecondaryPriceOpinion>;
    fast: SecondaryPriceOpinionBigNumber<SecondaryPriceOpinion>;
}

export const parseUnits = (target: number | string | BigNumber, power: number) => (
    ethers.BigNumber.from(new BigNumber(target).times(new BigNumber(10).pow(power)).toFixed(0))
)

const web3 = new Web3()

export const timeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const randomNonce = (index = 0) => (
    encodeNonce(ethers.BigNumber.from(ethers.utils.hexlify(ethers.utils.randomBytes(20))), index)
)

const retryGuards = (
    fn: (attempt: number, innerFn: (...a: any[]) => Promise<any>, a: any[]) => Promise<any>
) => async <T>(
    limit: number,
    innerFn: (...a: any[]) => Promise<T>,
    ...a: any[]
): Promise<T> => {
    if (limit > 1000) {
      throw new Error('asking for too many retries')
    }
    let attempt = 0
    while (attempt < limit) {
        attempt += 1
        const result = await fn(attempt, innerFn, a)
        if (result) {
            return result
        }
        await timeout(1250)
    }
    throw new Error('unable to complete retry')
}

export const retry = retryGuards(async (attempt, fn) => {
    try {
        return await fn()
    } catch (err) {
        console.error(err)
    }
})

export const getWeb3 = (provider: string): Web3 => {
  if (provider.indexOf('wss') >= 0) {
    return new Web3(new Web3.providers.WebsocketProvider(provider, {
        clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
        },
    }));
  } else {
    return new Web3(new Web3.providers.HttpProvider(provider));
  }
}

export const parseAbi = (abi: string): ethers.ContractInterface => (
  JSON.parse(
    abi.toString()
        .replace(/[\u200B-\u200D\uFEFF]/g, ''),
  )
)

export const alwaysFirstSegmented = <T extends Array<any>, U>(fn: (...a: T) => U) => {
    let waiting: { [key: string]: Promise<U> } = {}
    return (key: string, ...a: T) => {
        waiting[key] = waiting[key] || fn(...a)
        return waiting[key]
    }
}

export const normalizeGuid = (guid_: string) => (
    guid_.slice(0, 2) === '0x' ? guid_ : `0x${guid_}`
)

/**
 * Interface describing an ethereum key pair
 */
 export type EthereumAccount = {
    publicAddress: string,
    privateKey: string;
}

type SecretValueResult = {
    SecretString?: string;
}

const printSingleOwnerAddress = _.once((address: string) => {
    console.log('single owner address', new Date(), address)
})

const relayerUrl = `https://${
    isProd ? 'polygon-' : 'mumbai-'
}relayer.sequence.app`

console.log('relayer url', relayerUrl)

const ensureWalletGenerated = async (signer: ethers.Signer, provider: ethers.providers.Provider) => {
    const singleOwner = await Wallet.singleOwner(signer)
    const relayer = new RpcRelayer({
        url: relayerUrl,
        provider,
        bundleCreation: true,
    })
    const wallet = singleOwner.connect(provider, relayer)
    const isDeployed = await wallet.isDeployed(chainId)
    if (!isDeployed) {
        console.log('creating contract based wallet', await wallet.getAddress())
        // calls wait internally
        try {
            await wallet.sendTransaction({
                to: await signer.getAddress(),
                value: 0,
            })
        } catch (err) {
            console.error(err)
            throw err
        }
    }
    console.log('wallet is deployed')
}

export const getSequencerWallet = alwaysFirstSegmented(async (signer: ethers.Signer, provider: ethers.providers.Provider): Promise<Wallet> => {
    await ensureWalletGenerated(signer, provider)
    const singleOwner = await Wallet.singleOwner(signer)
    const relayer = new RpcRelayer({
        url: relayerUrl,
        provider: provider,
        bundleCreation: false,
    })

    printSingleOwnerAddress(await singleOwner.getAddress())
    // signer must already be connected
    return singleOwner.connect(provider, relayer)
})

export const getWallet = alwaysFirstSegmented(async (provider: ethers.providers.Provider): Promise<ethers.Wallet> => {
    if (Environment.env.SYSTEM_ACCOUNT) {
        const systemAccount: EthereumAccount = JSON.parse(Environment.env.SYSTEM_ACCOUNT);
        return new ethers.Wallet(systemAccount.privateKey, provider)
    } else {
        const client: AWS.SecretsManager = new AWS.SecretsManager({
            region: Environment.env.AWS_REGION,
        });
        const params: AWS.SecretsManager.Types.GetSecretValueRequest = {
            SecretId: Environment.env.AWS_SYSTEM_WALLET_SECRET_NAME,
        };
        const result = await promisify<SecretValueResult>(client, 'getSecretValue', params)
        if (!result.SecretString) {
            throw new Error('Missing SecretString')
        }
        const systemAccount: EthereumAccount = JSON.parse(result.SecretString)
        return new ethers.Wallet(systemAccount.privateKey, provider)
    }
})

export const parseReasonData = (reasonData_: string) => {
  const reasonData = `0x${reasonData_.slice(138)}`;
  const reasonBuffer: Buffer = Buffer.from(toAscii(reasonData));
  const trimmedBuffer: Buffer = reasonBuffer.slice(0, reasonBuffer.indexOf(0x00));
  return trimmedBuffer.toString();
}

export const oneAtATime = <T>(fn: (...a: any[]) => Promise<T>) => {
  let waiting = Promise.resolve(null as unknown as T)
  return async (...a: any[]): Promise<T> => {
    waiting = waiting.catch(() => {}).then(() => fn(...a))
    return waiting
  }
}

export const oneAtATimeSegmented = <T>(fn: (...a: any[]) => Promise<T>) => {
    let waiting = {} as { [key: string]: Promise<T> }
    const resolved = Promise.resolve(null)
    return async (key: string, ...a: any[]): Promise<T> => {
      waiting[key] = (waiting[key] || resolved).catch(() => {}).then(() => fn(...a))
      return waiting[key]
    }
  }

export const getNextNonce = oneAtATime((() => {
    const nextNonceMap: { [key: string]: number } = {}
    let lastUpdated = new Date(0)
    return async (signer: ethers.Signer, updatedSince: Date = new Date(0), prepare?: boolean, countType?: string): Promise<number> => {
        const publicAddress = await signer.getAddress()
        const lowerAddress = publicAddress.trim().toLowerCase()
        if (typeof nextNonceMap[lowerAddress] !== 'number' || +updatedSince > +lastUpdated) {
            // already incremented because it is a count
            const type = countType || 'pending'
            let count = await signer.getTransactionCount(type)
            lastUpdated = new Date()
            console.log('getTransactionCount called for', lowerAddress, count, type)
            nextNonceMap[lowerAddress] = count
            if (prepare) {
                nextNonceMap[lowerAddress] = nextNonceMap[lowerAddress] - 1
            }
        } else {
            nextNonceMap[lowerAddress] += 1
            console.log('cached nonce incremented used', lowerAddress, nextNonceMap[lowerAddress])
        }
        return nextNonceMap[lowerAddress]
      }
})())

export type RetryInfo = {
    attempt: number;
    nonce: number;
    batchTimestamp: Date;
    signer: ethers.Wallet;
    gasLimit: ethers.BigNumber;
    // create separate object
    underpriced?: number;
    expiredNonce?: number;
    increaseReplacementFee?: number;
    transactionReplaced?: number;
}

export const baseGasLimit = ethers.BigNumber.from(21_000)

export const retryIfRecoverable = retryGuards(async <T>(attempt: number, fn: (memo: RetryInfo) => Promise<T>, args: any[]): Promise<T | undefined> => {
    const memo = args[0] as RetryInfo
    try {
        memo.attempt = attempt
        return await fn(memo)
    } catch (err) {
        const e = err as RevertError & {
            transaction: ethers.providers.TransactionRequest & {
                hash: string;
            }
        }
        const msg = e.message.toLowerCase()
        if (msg.includes('transaction underpriced')) {
            memo.underpriced = incrementValue(memo.underpriced)
            console.log('increment underpriced', e?.transaction?.hash)
            // next call, attempt will be incremented and used downstream
            return
        } else if (msg.includes('replacement fee too low')) {
            memo.increaseReplacementFee = incrementValue(memo.increaseReplacementFee)
            memo.underpriced = incrementValue(memo.underpriced)
            console.log('increment underpriced + force high gas limit')
            return
        }
        console.log(msg)
        throw err
    }
})

const incrementValue = (value: number | undefined) => value ? (value + 1) : 1

export const promisify = <T>(client: any, method: string, ...params: any[]): Promise<T> => {
    return new Promise((resolve, reject) => {
        client[method](...params, (err: any, result: T) => {
            if (err) reject(err)
            else resolve(result)
        })
    })
}

interface Cachable <T>{
    tsmp?: Date;
    result?: T;
}

interface Spreadable <T>{
    (...a: any[]): T;
}

const cacheGetterTTL = <T extends Array<any>>(getMaker: () => (...a: T) => Cachable<any>) => (
    <U>(ms: number, fn: Spreadable<U>) => {
        const getter = getMaker()
        return (...a: T): U => {
            let target: Cachable<U> = getter(...a)
            const now = new Date()
            if (!target.tsmp) {
                target.tsmp = now
            }
            if ((+target.tsmp + ms) < +now || !target.result) {
                // refresh the cache
                target.result = fn(...a)
                target.tsmp = now
            }
            return target.result
        }
    }
)

export const cacheKeyTTL = cacheGetterTTL((() => {
    const hash: { [key: string]: Cachable<any> } = {}
    return (key: string | number | undefined | null) => {
        const k = key as unknown as string
        const target = hash[k] = hash[k] || {}
        return target
    }
}))

export const cacheTTL = cacheGetterTTL((() => {
    const hash: Cachable<any> = {}
    return (..._a: any[]) => hash
}))

export const sendSelfTransaction = async (
    signer: ethers.Signer,
    nonce: number,
    gasLimit: ethers.BigNumber,
    batchTimestamp: Date,
    overwrites: (gasLimit: ethers.BigNumber, underpriced: number | undefined) => TxOverwrites,
) => {
    const address = await signer.getAddress()
    return retryIfRecoverable(10, ({ gasLimit, underpriced, attempt }) => {
        // presume the first attempt will be underpriced
        const multiplier = (underpriced || 1) * 3
        const { maxFeePerGas, maxPriorityFeePerGas } = overwrites(gasLimit, underpriced)
        console.log('using', maxFeePerGas?.toString(), maxPriorityFeePerGas?.toString(), 'to overwrite gas', nonce)

        return signer.sendTransaction({
            maxPriorityFeePerGas: maxPriorityFeePerGas?.mul(multiplier),
            maxFeePerGas: maxFeePerGas?.mul(multiplier).mul(12).div(10),
            nonce,
            value: 0,
            from: address,
            to: address,
        })
    }, {
        gasLimit,
        signer,
        batchTimestamp,
    })
}

export type RevertError = Error & {
  receipt: ethers.ContractReceipt;
  transaction: ethers.providers.TransactionRequest;
  reason?: string;
  data: string;
  error?: Error & {
    data: string;
    error?: Error & {
      data: string;
    }
  };
}

const retry_strategy = (options: any) => {
    if (options.error && (options.error.code === 'ECONNREFUSED' || options.error.code === 'NR_CLOSED')) {
        // Try reconnecting after 5 seconds
        console.error('The server refused the connection. Retrying connection...');
        return 5000;
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands with an individual error
        return new Error('Retry time exhausted');
    }
    if (options.attempt > 50) {
        // End reconnecting with built in error
        return undefined;
    }
    // reconnect after
    return Math.min(options.attempt * 100, 3000);
}

export class Util {

  private static lastInvalidationCall: number = new Date().getTime();

  private static redis: Redis.RedisClientType | RedisMock.RedisClientType;
  private static localRedis: any = { };

  public static readonly BLACK_HOLE = '0x0000000000000000000000000000000000000000';

  // Used to store test values
  public static testVar: any;

  static getRedis() {
      return this.redis
  }

  /**
   * Connects to the elasti cache redis service
   */
  public static async connectToRedis(useLocalhost = false): Promise<void> {
    if (Util.redis) {
      return;
    }
    try {
      const options: any = useLocalhost ? { } : { url: `redis://${Environment.env.REDIS_ENDPOINT}:${Environment.env.REDIS_PORT}` };
      const R = options.url ? Redis : RedisMock
      Util.redis = R.createClient({
        retry_strategy,
        ...options,
      });
      await Util.redis.connect();
    } catch (err: unknown) {
      const e = err as Error
      console.log(err)
      Util.redis = RedisMock.createClient();
      const message: string = err && e.message ? e.message : 'unknown cause';
      throw new Error(`Could not connect to Redis: ${message}`);
    }
  }

  /**
   * Sets a value in our REDIS store
   * @param key
   * @param value
   * @param ttlMillis
   */
  public static async redisSet(key: string, value: string, ttlMillis?: number): Promise<void> {
    const _key: string = ethers.utils.sha256(ethers.utils.toUtf8Bytes(key));
    if (Util.redis) {
      const options = ttlMillis ? { PX: ttlMillis } : {};
      try {
        await Util.redis.set(_key, value, options);
      } catch (err) {
        // We lost REDIS, try to reconnect
        // TODO Notify operator that we lost connection to REDIS
        try {
          Util.redis = RedisMock.createClient();
          await Util.connectToRedis();
          // TODO Notify operator that we re-connected to REDIS
          return await Util.redisSet(_key, value, ttlMillis); // Trying again using REDIS after successful re-connect
        } catch (err) {
          // Couldn't re-connect
          // TODO Notify operator that we could not re-connect to REDIS, so we are now using local memory
          Util.redis = RedisMock.createClient();
          return await Util.redisSet(_key, value, ttlMillis); // No longer using REDIS, using local memory
        }
      }
    } else {
      // We are going to use this process memory
      let timerRef: Timeout | undefined = undefined;
      if (ttlMillis) {
        timerRef = setTimeout(() => {
          delete Util.localRedis[_key];
        }, ttlMillis);
      }
      Util.localRedis[_key] = {
        timestamp: new Date().getTime(),
        ttlMillis,
        value,
        timerRef
      };
    }
  }

  /**
   * Deletes a specific key from our REDIS store
   * @param key
   */
  public static async redisDel(key: string): Promise<void> {
    const _key: string = ethers.utils.sha256(ethers.utils.toUtf8Bytes(key));
    if (Util.redis) {
      try {
        await Util.redis.del(_key);
      } catch (err) {
        // We lost REDIS, try to reconnect
        // TODO Notify operator that we lost connection to REDIS
        try {
          Util.redis = RedisMock.createClient();
          await Util.connectToRedis();
          // TODO Notify operator that we re-connected to REDIS
          await Util.redis.del(_key); // Trying again using REDIS after successful re-connect
        } catch (err) {
          // Couldn't re-connect
          // TODO Notify operator that we could not re-connect to REDIS, so we are now using local memory
          Util.redis = RedisMock.createClient();
          await Util.redis.del(_key); // No longer using REDIS, using local memory
        }
      }
    } else {
      // We are going to use this process memory
      const val: any = Util.localRedis[_key];
      if (val && val.timerRef) {
        clearTimeout(val.timerRef);
      }
      delete Util.localRedis[_key];
    }
  }

  /**
   * Gets a value from our REDIS store
   * @param key
   */
  public static async redisGet(key: string): Promise<string | null> {
    const _key: string = ethers.utils.sha256(ethers.utils.toUtf8Bytes(key));
    if (Util.redis) {
      try {
        return await Util.redis.get(_key);
      } catch (err) {
        // We lost REDIS, try to reconnect
        // TODO Notify operator that we lost connection to REDIS
        try {
          Util.redis = RedisMock.createClient();
          await Util.connectToRedis();
          // TODO Notify operator that we re-connected to REDIS
          return await Util.redis.get(_key); // Trying again using REDIS after successful re-connect
        } catch (err) {
          // Couldn't re-connect
          // TODO Notify operator that we could not re-connect to REDIS, so we are now using local memory
          Util.redis = RedisMock.createClient();
          return await Util.redis.get(_key); // No longer using REDIS, using local memory
        }
      }
    } else {
      // We are going to use this process memory
      const val: any = Util.localRedis[_key];
      if (val) {
        if (val.ttlMillis) {
          const now: number = new Date().getTime();
          const life: number = now - val.timestamp;
          if (life < val.ttlMillis) {
            return val.value;
          } else {
            return null;
          }
        } else {
          return val.value;
        }
      } else {
        return null;
      }
    }
  }

  /**
   * Forms a mysql formatted string from a javascript date object
   * @param dateIn
   */
  public static mysqlFromDate(dateIn: Date): string {
    const pad = (num: number) => { return ('00'+num).slice(-2) };
    const toRet: string = dateIn.getFullYear()  + '-' +
      pad(dateIn.getMonth() + 1)                + '-' +
      pad(dateIn.getDate())                     + ' ' +
      pad(dateIn.getHours())                    + ':' +
      pad(dateIn.getMinutes())                  + ':' +
      pad(dateIn.getSeconds());
    return toRet;
  }

  /**
   * Sleeps for the specified # of milliseconds
   * @param durationMs
   */
  public static async sleep(durationMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, durationMs);
    });
  }

  /**
   * Invalidates cloud front cache for the specified paths on the public metadata server
   * @param paths
   */
  public static invalidateCloudfront(paths: string[], backoffSecs: number = 0): void {

      // Make sure we are not calling invalidation endpoint at AWS too often, but only on the first time through
      const delta: number = new Date().getTime() - Util.lastInvalidationCall;
      if (delta < 1500) {
        // Resolve the promise and requeue the request in 2 seconds
        setTimeout(async () => {
          Util.invalidateCloudfront(paths, backoffSecs);
        }, 2000);
        return;
      }

      // If we get here, we are calling at the throttled pace
      Util.lastInvalidationCall = new Date().getTime();

      // Create the cloudfront payload
      const cloudfront = new AWS.CloudFront();
      const pngInvalidation: CloudFront.Types.CreateInvalidationRequest = {
        DistributionId: Environment.env.AWS_CLOUDFRONT_DISTRIBUTION,
        InvalidationBatch: {
          CallerReference: uuidv4(),
          Paths: {
            Quantity: paths.length,
            Items: paths
          }
        }
      };

      // We are making the call here
      cloudfront.createInvalidation(pngInvalidation, (err: AWSError, data: CreateInvalidationResult) => {
        if  (!err) {
          // TODO Remove this
          paths.forEach((path: string) => {
            // console.log(`======== SUCCESS ======== Invalidated cloudfront for ${path}`);
          });
        } else {
          // Output the error to the console, but still resolve because we want to eat this error
          // if (err && err.code && err.code.toLowerCase() === 'throttling') {

            // We are throttling, so we are going to provide an exponential backoff and then
            // return a resolved promise (because this is not needed to continue to block the caller).
            if (backoffSecs < 3600) {

              let newBackoffSecs: number = backoffSecs;
              if (newBackoffSecs === 0) {
                // First time through do the resolve on the promise
                newBackoffSecs = 5 + Math.floor(5 * Math.random());
              } else {
                // Another exponential backoff
                newBackoffSecs = 2 * newBackoffSecs;
              }

              // We are throttling the request so output warning
              paths.forEach((path: string) => {
                // TODO Notify devops
                console.log(`======== WARNING ======== Throttling invalidation for ${path} for ${newBackoffSecs} seconds`);
              });

              // Issue new call to invalidate
              setTimeout(() => {
                Util.invalidateCloudfront(paths, Math.floor(newBackoffSecs));
              }, Math.floor(Math.floor(1000 * newBackoffSecs)));

            } else {
              // If our backoff exceeds 1 hour, give up
              paths.forEach((path: string) => {
                // TODO Notify devops
                console.log(`======== ERROR ======== Failed to invalidate ${path}`);
              });
            }
          // } else {
          //   // Unknown error
          //   // TODO Notify devops
          //   console.log(err);
          //
          //   // We do not reject because this is a non-fatal error
          //   resolve(err);
          // }
        }
      });
  }

  /**
   * Sends and retries sending a pusher message
   * @param pusherService
   * @param eventToSend
   * @param message
   * @param retry
   * @param personal
   */
  public static async sendPusherMessage(
    pusherService: PusherService,
    eventToSend: any,
    message: any,
    retry: number,
    address?: string
  ): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const msg = {
            ...message,
            errorMessage: message.errorMessage?.slice(0, 256),
            reason: message.reason?.slice(0, 256),
        }
        const serialized = JSON.stringify(msg)
        const uuid = uuidv5(serialized, '609c1ac0-8218-49a7-ab19-4277cf90e899')
        if (retry < 5) {
            console.log(
                'pusher send',
                retry,
                eventToSend,
                uuid,
            )
        }
        msg.uuid = uuid
        await pusherService.sendMessage(eventToSend, msg, address)
        resolve();
      } catch (err) {
        console.log(err)
        if (retry > 0) {
          // Retry in 5 seconds
          setTimeout(() => {
            console.log(`---------------------------`);
            console.log(`Pusher send message retry ${retry}`);
            console.log(`---------------------------`);
            Util.sendPusherMessage(pusherService, eventToSend, message, --retry);
          }, 5000);
        } else {
          // We don't want an error thrown here - just output the error to console
          console.log(eventToSend);
          console.log(message);
          reject();
        }
      }
    });
  }

  // Simple method to issue GET
  public static async getContent(url: string): Promise<string>  {
    // return new pending promise
    return new Promise((resolve, reject) => {
      // select http or https module, depending on reqested url
      const lib = url.startsWith('https') ? require('https') : require('http');
      const request = lib.get(url, (response: IncomingMessage) => {
        // handle http errors
        if (((response.statusCode && response.statusCode < 200)) || (response.statusCode && (response.statusCode > 301))) {
          reject(new Error('Failed to load page, status code: ' + response.statusCode));
        }
        // temporary data holder
        const body: any[] = [];
        // on every content chunk, push it to the data array
        response.on('data', (chunk: any) => body.push(chunk));
        // we are done, resolve promise with those joined chunks
        response.on('end', () => resolve(body.join('')));
      });
      // handle connection errors of the request
      request.on('error', (err: Error) => reject(err))
    })
  }

  /**
   * Returns the value stored in our key value table for a given namespace and key
   * @param namespace
   * @param key
   */
  public static async getValue(namespace: string, key: string): Promise<string | undefined> {
    const kvRepo = getRepository<KeyValue>(KeyValue);
    const kv: KeyValue | undefined = await kvRepo.findOne({ where: {
        namespace,
        key
      }});
    if (kv) {
      return kv.value;
    } else {
      return undefined;
    }
  }

  /**
   * Converts gwei to eth
   * @param gwei
   */
  public static gweiToEth(gwei: number): number {
    return gwei / 1e9;
  }

  /**
   * Record an error at newrelic
   * @param eventType
   * @param attributes
   */
  public static noticeError(error: any, attributes?: { [key: string]: string | number | boolean }): void {
    try {
      if (typeof attributes === 'string') {
        console.log(attributes);
      }
      // TODO: Fix this
      // newrelic.noticeError(error, attributes);
    } catch (error) {
      // We eat this because it is not critical
      console.log(error);
    }
  }

  /**
   * Record a custom newrelic event
   * @param eventType
   * @param attributes
   */
  public static recordCustomEvent(eventType: string, attributes?: any): void {
    try {
      // TODO: Fix this
      // newrelic.recordCustomEvent(eventType, attributes);
    } catch (error) {
      // We eat this because it is not critical
      console.log(error);
    }
  }

  /**
   * Returns the
   * @param web3
   * @param blockNumber
   */
  public static async getBlockTimestamp(web3: Web3, blockNumber: number) : Promise<Date> {
    return new Promise<Date>((resolve, reject) => {
      web3.eth.getBlock(blockNumber, true, async (error: any, result: any) => {
        const now = new Date()
        const nowTruncated = new Date(+now - (+now % 1000))
        if (error) {
          const message: string = error && error.message ? error.message : 'Util.getBlockTimestamp() could note retrieve block from provider - using current server timestamp';
          Util.noticeError(error, { message });
          resolve(nowTruncated);
        } else {
          resolve(result ? new Date(result.timestamp * 1000) : nowTruncated);
        }
      });
    });
  }

  /**
   * Return a bool whether the user is connected to the System Checker or not (from the blockchain)
   */
  public static async isUserConnected(address: string): Promise<boolean> {

    // Retrieve from cache if we can
    const cacheKey: string = await this.getUserCacheKey(address, ECacheKeys.IS_CONNECTED);
    const isConnected: string | null = await this.redisGet(cacheKey);
    if (isConnected) {
      return isConnected === 'true';
    }

    // Grab the blockchain contract record for the SYSTEM_CHECKER contract
    const systemCheckerContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'SYSTEM_CHECKER',
        mode: Environment.env.MODE
      }});
    if (!systemCheckerContract) {
      return false;
    }

    // Grab provider
    const providers: string[] = systemCheckerContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(systemCheckerContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], systemCheckerContract.address);

    // Get the owner of a given catTokenId from the blockchain (with retry capability)
    const isUserConnected = async (retryCount: number): Promise<boolean> => {
      try {
        return await contractWeb3Instance.methods.isConnected(address).call();
      } catch (error) {
        if (retryCount > 0) {
          return await isUserConnected(--retryCount);
        } else {
          return false;
        }
      }
    };

    const toRet: boolean = await isUserConnected(3);

    // Put result in cache for 1 second and return
    if (typeof toRet !== undefined) {
      const val: string = toRet ? 'true' : 'false';
      await this.redisSet(cacheKey, val, 1000);
      return toRet;
    } else {
      return false;
    }
  }

  /**
   * Get Cool Pet token owner address from token id from the blockchain
   */
  public static async getPetOwner(petTokenId: number): Promise<any> {
    // Grab the blockchain contract record for the COOLPET_721 contract
    const petContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'COOLPET_721',
        mode: Environment.env.MODE
      }});
    if (!petContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = petContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(petContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], petContract.address);

    // Get the owner of a given petTokenId from the blockchain (with retry capability)
    const getTokenOwner = async (retryCount: number): Promise<any[] | undefined> => {
      try {
        return await contractWeb3Instance.methods.ownerOf(petTokenId).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getTokenOwner(--retryCount);
        } else {
          return undefined;
        }
      }
    };

    return await getTokenOwner(3);
  }

  /**
   * Get Cool Cat token owner address from token id from the blockchain
   */
  public static async getCatOwner(catTokenId: number): Promise<any> {
    // Grab the blockchain contract record for the COOLPET_721 contract
    const catContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'COOLCAT_721',
        mode: Environment.env.MODE
      }});
    if (!catContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = catContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(catContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], catContract.address);

    // Get the owner of a given catTokenId from the blockchain (with retry capability)
    const getTokenOwner = async (retryCount: number): Promise<any[] | undefined> => {
      try {
        return await contractWeb3Instance.methods.ownerOf(catTokenId).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getTokenOwner(--retryCount);
        } else {
          return undefined;
        }
      }
    };

    return await getTokenOwner(3);
  }

  /**
   * Get Cool Pet tokens owned by an address from the blockchain
   * REQUIRES THE PET_UTILS CONTRACT TO BE DEPLOYED
   */
  public static async getOwnedPets(account: string): Promise<(undefined | number)[] | undefined> {
    // Grab the blockchain contract record for the PET_UTILS contract
    const petUtilsContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
      code: 'PET_UTILS',
      mode: Environment.env.MODE
    }});
    if (!petUtilsContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = petUtilsContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)

    // Grab ABI
    const abi = parseAbi(petUtilsContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], petUtilsContract.address);

    // Get the owned cats for a given account from the blockchain (with retry capability)
    const getOwnedTokens = async (retryCount: number): Promise<string> => {
      try {
        return await contractWeb3Instance.methods.getWalletOfOwnerForSelection(account, 0, 19999).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getOwnedTokens(--retryCount);
        } else {
          return "";
        }
      }
    };

    return Util.validateIdListParameter((await getOwnedTokens(3)).replace(/,\s*$/, ""));
  }

  /**
   * Returns the key for our next update time
   * @param address
   * @param prefix for key
   */
  public static async getUserCacheKey(address: string, prefix: string): Promise<string> {
    let cacheBuster: string | null = await Util.cachedKeyVal('SYSTEM_CONFIG', 'cacheBuster', 300000);
    if (!cacheBuster) {
      cacheBuster = '';
    }
    return `next-claim-time-${cacheBuster}-${address.toLowerCase()}`;
  }

  /**
   * Returns the value for a given key val. Caches for specified millis
   * @param namespace
   * @param key
   * @param cacheMillis
   */
  public static async cachedKeyVal(namespace: string, key: string, cacheMillis: number): Promise<string | null> {
    const redisKey = `${namespace}-${key}`;
    let val: string | null = await Util.redisGet(redisKey);
    if (!val) {
      // Need to get it from the database
      const keyValRepo: Repository<KeyValue> = getRepository(KeyValue);
      const dbValue: KeyValue | undefined = await keyValRepo.findOne({
        where: {
          namespace,
          key
        }
      });
      val = dbValue ? dbValue.value : null;
      if (dbValue) {
        await Util.redisSet(redisKey, dbValue.value, cacheMillis);
      }
    }
    return val;
  }

  /**
   * Returns the value for a given
   * @param namespace
   * @param key
   * @param cacheMillis
   */
  public async cachedKeyVal(namespace: string, key: string, cacheMillis: number): Promise<string | null> {
    const redisKey = `${namespace}-${key}`;
    let val: string | null = await Util.redisGet(redisKey);
    if (!val) {
      // Need to get it from the database
      const keyValRepo: Repository<KeyValue> = getRepository(KeyValue);
      const dbValue: KeyValue | undefined = await keyValRepo.findOne({
        where: {
          namespace,
          key
        }
      });
      val = dbValue ? dbValue.value : null;
      if (dbValue) {
        await Util.redisSet(redisKey, dbValue.value, cacheMillis);
      }
    }
    return val;
  }

  /**
   * Validates a comma delimited list of numbers and returns as an array of numbers
   * @param commaDelimitedInts
   */
  public static validateIdListParameter(commaDelimitedInts: string): (undefined | number)[] | undefined {
    if (commaDelimitedInts) {
      let allGood = true;
      const asArray: any[] = commaDelimitedInts.split(',');
      const idsAsArrayOfNumbers: (undefined | number)[] = asArray.map((val: any) => {
        const asInt: number = parseInt(val);
        if (isNaN(asInt) || asInt < 0) {
          allGood = false;
          return undefined;
        }
        return asInt;
      });
      return allGood ? idsAsArrayOfNumbers : undefined;
    } else {
      return undefined;
    }
  }

  /**
   * Get the listing data for a given listing ID
   *
   *   struct ListingStruct {
   *     address seller;
   *     uint256 id;
   *     uint256 tokenId;
   *     uint256 amount;
   *     uint256 listingTime;
   *     uint256 price; // desired price to earn in Wei
   *     uint256 listedPrice; // price + fees
   *   }
   *
   */
  public static async getMarketplaceListingData(listingId: number): Promise<IMarketplaceListingData | undefined> {
    // Grab the blockchain contract record for the QUEST contract
    const marketplaceContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'MARKETPLACE',
        mode: Environment.env.MODE
      }});
    if (!marketplaceContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = marketplaceContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(marketplaceContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], marketplaceContract.address);

    // Get the balance of a user for The Cool Box and Pet items 2-49 from the blockchain (with retry capability)
    const getListingData = async (retryCount: number): Promise<any[]> => {
      try {
        return await contractWeb3Instance.methods.getListing(listingId).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getListingData(--retryCount);
        } else {
          return [];
        }
      }
    };

    const listingData = await getListingData(3);
    if (listingData.length == 0) {
      return undefined;
    } else {
      return {
        seller: listingData[0],
        id: listingData[1],
        tokenId: listingData[2],
        amount: listingData[3],
        listingTime: listingData[4],
        price: listingData[5],
        listedPrice: listingData[6],
      }
    }
  }

  /**
   * Get all current marketplace listing IDs
   */
  public static async getMarketplaceListingIds(): Promise<number[] | undefined> {
    // Grab the blockchain contract record for the QUEST contract
    const marketplaceContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'MARKETPLACE',
        mode: Environment.env.MODE
      }});
    if (!marketplaceContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = marketplaceContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(marketplaceContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], marketplaceContract.address);

    // Get the balance of a user for The Cool Box and Pet items 2-49 from the blockchain (with retry capability)
    const getListingIds = async (retryCount: number): Promise<any[]> => {
      try {
        return await contractWeb3Instance.methods.getListingIds().call();
      } catch (error) {
        if (retryCount > 0) {
          return await getListingIds(--retryCount);
        } else {
          return [];
        }
      }
    };

    return (await getListingIds(3)).map(str => parseInt(str, 16)) as number[];
  }

  /**
   * Get stage of a Pet from the blockchain
   *   // egg = 0
   *   // stage1 = 1
   *   // stage2 = 2
   *   // final form = 3
   */
  public static async getPetStage(petTokenId: number): Promise<number | undefined> {
    // Grab the blockchain contract record for the PET_INTERACTION contract
    const petInteractionContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'PET_INTERACTION',
        mode: Environment.env.MODE
      }});
    if (!petInteractionContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = petInteractionContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(petInteractionContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], petInteractionContract.address);

    // Get the stage of a pet from the blockchain (with retry capability)
    const getPetStage = async (retryCount: number): Promise<number> => {
      try {
        return await contractWeb3Instance.methods.getCurrentPetStage(petTokenId).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getPetStage(--retryCount);
        } else {
          return 0;
        }
      }
    };

    return await getPetStage(3);
  }

  /**
   * Get all Pet item interactions from the blockchain
   */
  public static async getPetInteractions(petTokenId: number): Promise<IPetItemInteraction[]> {

    // Grab the blockchain contract record for the PET_INTERACTION contract
    const petInteractionContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'PET_INTERACTION',
        mode: Environment.env.MODE
      }});
    if (!petInteractionContract) {
      return [];
    }

    // Grab provider
    const providers: string[] = petInteractionContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(petInteractionContract.abi)

    // Return the quest web3 contract instance
    const contractWeb3Instance = new web3.eth.Contract(abi as AbiItem[], petInteractionContract.address);

    // Get the stage of a pet from the blockchain (with retry capability)
    const getInteractions = async (retryCount: number): Promise<[]> => {
      try {
        return await contractWeb3Instance.methods.getInteractions(petTokenId).call();
      } catch (error) {
        if (retryCount > 0) {
          return await getInteractions(--retryCount);
        } else {
          return [];
        }
      }
    };

    const interactions = await getInteractions(3);
    const formattedInteractions: IPetItemInteraction[] = [];

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      formattedInteractions.push(
          {
            from: interaction[0],
            itemTokenId: parseInt(interaction[1]),
            time: parseInt(interaction[2]),
          }
      )
    }

    return formattedInteractions;
  }

  /**
   * Returns the transaction associated with a given transaction hash
   * @param web3
   * @param trxHash
   */
  public static async getTransaction(web3: Web3, trxHash: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      web3.eth.getTransaction(trxHash, async (error: any, result: any) => {
        if (error) {
          const message: string = error && error.message ? error.message : 'Util.getTransaction() failed - value of transaction record set to 0';
          Util.noticeError(error, { message });
          resolve({ value: 0 });
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Method to get user quests from the block chain
   * @param address
   */
  public static async getUserQuestsFromBlockchain(address: string): Promise<TUserReferenceQuest[]> {
    const contractAndWeb3: IContractWeb3 | undefined = await Util.resolveQuestWeb3Contract();
    if (!contractAndWeb3) {
      return [];
    }
    const contract = contractAndWeb3?.contract;
    const web3 = contractAndWeb3?.web3;

    // Get the box price from the blockchain (with retry capability)
    const getUserQuests = async (retryCount: number): Promise<[]> => {
      try {
        const toRet = await contract.methods.getUserReferenceQuests(address).call();
        return toRet;
      } catch (error: any) {
        if (error?.message?.toLowerCase().indexOf('execution reverted') >= 0) {
          return [];
        } else {
          console.log('+------- Could not rescan QUESTS for address --------+')
          return [];
        }
      }
    };

    const userQuests = await getUserQuests(3);
    const formattedQuests: TUserReferenceQuest[] = [];

    for (let i = 0; i < userQuests.length; i++) {
      const referenceQuest = userQuests[i];
      formattedQuests.push(
          {
            element: parseInt(referenceQuest[0]),
            questId: parseInt(referenceQuest[1]),
            ioId: parseInt(referenceQuest[2]),
          }
      )
    }

    return formattedQuests;
  }


  /**
   * Returns the web3 contract instance for the quest contract
   * @private
   */
  public static async resolveQuestWeb3Contract(): Promise<IContractWeb3 | undefined> {

    // Grab the blockchain contract record for the QUEST contract
    const questContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({where: {
        code: 'QUEST',
        mode: Environment.env.MODE
      }});
    if (!questContract) {
      return undefined;
    }

    // Grab provider
    const providers: string[] = questContract.provider.split('|');
    const provider: string = providers[0];
    const web3 = getWeb3(provider)
    // Grab ABI
    const abi = parseAbi(questContract.abi)

    // Return the quest web3 contract instance
    const contract = new web3.eth.Contract(abi as AbiItem[], questContract.address);
    return {
      contract,
      web3
    }
  }

  /**
   * Sets a named property for a given user specified by the user's address. Will overwrite
   * existing value if found.
   *
   * @param address
   * @param property
   * @param value
   */
  public static async setUserNamedProperty(address: string, property: string, value: string): Promise<void> {

    const userRepository = getRepository<User>(User);
    const userPropertyRepository = getRepository<UserProperty>(UserProperty);

    // Grab user record
    let user: User | undefined = await userRepository.findOne({
      where: {
        account: address
      }
    });
    if (!user) {
      user = await Util.createUser(userRepository, address);
    }

    // See if there is an existing named property for this user. If not, we are going to create one.
    let userProp: UserProperty | undefined = await userPropertyRepository.findOne({
      where: {
        key: property,
        user
      }
    });
    if (!userProp) {
      userProp = new UserProperty();
      userProp.user = user;
      userProp.key = property;
    }

    // Assign the new value and blow out of here.
    userProp.value = value;
    await userPropertyRepository.save<UserProperty>(userProp);

  }

  /**
   * Returns the reason for an EVM revert
   * @param web3
   * @param transactionReceipt
   */
  public static async revertReason(provider: ethers.providers.Provider, error: RevertError): Promise<string> {
    try {
      if (error.receipt) {
        const transactionReceipt = error.receipt;
        if (transactionReceipt.transactionHash && transactionReceipt.blockNumber) {
          const tx = await provider.getTransaction(transactionReceipt.transactionHash);
          try {
            await provider.call({
              from: tx.from,
              to: tx.to as string,
              value: tx.value,
              data: tx.data,
              gasLimit: tx.gasLimit,
              gasPrice: tx.type === 1 ? tx.gasPrice : undefined,
              maxFeePerGas: tx.type === 1 ? undefined : tx.maxFeePerGas,
              maxPriorityFeePerGas: tx.type === 1 ? undefined : tx.maxPriorityFeePerGas,
              type: tx.type as number || 2,
              nonce: tx.nonce,
            }, tx.blockNumber as number);
            return 'not reverted';
          } catch (err) {
            const error = (err as unknown as RevertError)
            const e = error?.error?.error || error?.error || error
            if (e.data) {
              let reasonData: string = e.data.startsWith('0x') ? e.data : `0x${e.data}`;
              if (reasonData.length >= 138) {
                return parseReasonData(reasonData)
              }
            }
            if (e.stack) {
              const firstNewline: number = e.stack.indexOf('\n');
              if (firstNewline > 0) {
                return e.stack.slice(0, firstNewline);
              }
            }
            return 'reason unavailable';
          }
        } else {
          return 'no transaction hash';
        }
      } else if (error.transaction) {
        // failed during estimate gas
        try {
          const tx = error.transaction
          const result = await provider.call({
            from: tx.from,
            to: tx.to as string,
            data: tx.data,
          })
          let reasonData: string = result.startsWith('0x') ? result : `0x${result}`;
          if (reasonData.length >= 138) {
            return parseReasonData(reasonData)
          }
        } catch (err) {
          const error = (err as unknown as RevertError)
          const e = error?.error?.error || error?.error || error
          if (e.data) {
            let reasonData: string = e.data.startsWith('0x') ? e.data : `0x${e.data}`;
            if (reasonData.length >= 138) {
              return parseReasonData(reasonData)
            }
          }
          if (e.stack) {
            const firstNewline: number = e.stack.indexOf('\n');
            if (firstNewline > 0) {
              return e.stack.slice(0, firstNewline);
            }
          }
          return 'reason unavailable';
        }
      } else {
        let err = error?.error || error
        // sometimes the error is on the error
        if (error.reason) {
          return error.reason
        }
        if (err.data) {
          let reasonData: string = err.data.startsWith('0x') ? err.data : `0x${err.data}`;
          if (reasonData.length >= 138) {
            return parseReasonData(reasonData)
          }
        } else {
          if (err.message) {
            return err.message;
          }
        }
      }
    } catch (error) {
      // We eat any error if we cannot parse things and just return 'Unknown Reason' as we fall through here
    }

    // Could not figure out what the reason was
    return 'Unknown Reason - could not parse from error object returned from blockchain';
  }

  /**
   * Creates a new user for a given account address
   * @param userRepo
   * @param account
   */
  public static async createUser(userRepo: any, account: string): Promise<User> {
    const user: User = new User();
    user.account = account;
    user.created = user.last_login = Util.mysqlFromDate(new Date());
    await userRepo.save(user);
    return user;
  }

  /**
   * Returns an account's current gold balance
   * @param provider
   * @param address
   */
  public static async goldBalance(provider: ethers.providers.Provider | Web3, address: string): Promise<string> {

    // Create instance of the gold contract
    const blockchainContractRepository: Repository<BlockchainContract> = getRepository<BlockchainContract>(BlockchainContract);
    const blockchainContract: BlockchainContract | undefined = await blockchainContractRepository.findOne({where: {
        code: 'GOLD_CONTRACT',
        mode: Environment.env.MODE
    }});

    if (blockchainContract) {
      // Grab ABI
        const abi = parseAbi(blockchainContract.abi)

        if (provider instanceof Web3) {

            const contract: any = new web3.eth.Contract(
                abi as AbiItem[],
                blockchainContract.address,
            );
            // Any error will be caught by parent
            const result = await contract.methods.balanceOf(address).call();

            return result;
        }

        const contract = new ethers.Contract(
            blockchainContract.address,
            abi,
            provider,
        ) as IERC20;

        // Any error will be caught by parent
        const result = await contract.balanceOf(address);

        return result.toString();

    } else {
        throw new Error('Could not find GOLD_CONTRACT');
    }
  }

  /**
   * Resets the Cool Pets Database (called on service startup if namespace: NEW_DEPLOYMENT, key: resetPetDatabase
   * is found to be 'true' in the KeyVal table)
   */
  public static async resetPetsDatabase(deleteValue = true): Promise<void> {
    try {
      const conn: Connection = getConnection();
      console.log(`Connected to database ${Environment.env.DB_CREDENTIALS.host}`);

      if (deleteValue) {
          console.log(`Deleting KeyValue where namespace is NEW_DEPLOYMENT`);
          await conn.createQueryBuilder().delete().from(KeyValue).where(`namespace = :ns`, {ns: 'NEW_DEPLOYMENT'}).execute();
      }

      console.log(`Deleting CatGoldAward content`);
      await conn.createQueryBuilder().delete().from(CatGoldAward).execute();

      console.log(`Deleting AdventureGoldAward content`);
      await conn.createQueryBuilder().delete().from(AdventureGoldAward).execute();

      console.log(`Deleting StakedPet content`);
      await conn.createQueryBuilder().delete().from(StakedPet).execute();

      console.log(`Deleting GoldTransaction content`);
      await conn.createQueryBuilder().delete().from(GoldTransaction).execute();

      console.log(`Deleting Nonce content`);
      await conn.createQueryBuilder().delete().from(Nonce).execute();

      console.log(`Deleting PetUserItem content`);
      await conn.createQueryBuilder().delete().from(PetUserItem).execute();

      console.log(`Deleting MarketplaceListing content`);
      await conn.createQueryBuilder().delete().from(MarketplaceListing).execute();

      console.log(`Deleting QuestHistory content`);
      await conn.createQueryBuilder().delete().from(QuestHistory).execute();

      console.log(`Deleting QuestSelection content`);
      await conn.createQueryBuilder().delete().from(QuestSelection).execute();

      console.log(`Deleting QuestTheme content`);
      await conn.createQueryBuilder().delete().from(QuestTheme).execute();

      console.log(`Deleting QuestIo content`);
      await conn.createQueryBuilder().delete().from(QuestIo).execute();

      console.log(`Deleting PetInteraction content`);
      await conn.createQueryBuilder().delete().from(PetInteraction).execute();

      console.log(`Deleting PetItem content`);
      await conn.createQueryBuilder().delete().from(PetItem).execute();

      console.log(`Deleting PetType content`);
      await conn.createQueryBuilder().delete().from(PetType).execute();

      console.log(`Deleting PetCategory content`);
      await conn.createQueryBuilder().delete().from(PetCategory).execute();

      console.log(`Deleting UserProperty content`);
      await conn.createQueryBuilder().delete().from(UserProperty).execute();

      console.log(`Deleting User content`);
      await conn.createQueryBuilder().delete().from(User).execute();

      const coolpetsBlockchainContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({
        where: {
          code: 'COOLPET_721',
          mode: Environment.env.MODE
        }
      });
      if (coolpetsBlockchainContract) {
        // Clean up the database
        console.log(`Deleting TokenTransfer for PET contract id: ${coolpetsBlockchainContract.id}`);
        await conn.createQueryBuilder().delete().from(TokenTransfer).where(`blockchainContractId = :id`, {id: coolpetsBlockchainContract.id}).execute();
        console.log(`Deleting CoolcatOwner for PET contract id: ${coolpetsBlockchainContract.id}`);
        await conn.createQueryBuilder().delete().from(CoolcatOwner).where(`blockchainContractId = :id`, {id: coolpetsBlockchainContract.id}).execute();
        console.log(`Deleting Coolpets content`);
        await conn.createQueryBuilder().delete().from(Coolpets).execute();
      }

    } catch (error) {
      console.log(error);
    }
  }

    /**
     * Resets the Cool Pets Database (called on service startup if namespace: NEW_DEPLOYMENT, key: resetPetDatabase
     * is found to be 'true' in the KeyVal table)
     */
    public static async resetGameDatabase(): Promise<void> {
        try {
            const conn: Connection = getConnection();
            console.log(`Connected to database ${Environment.env.DB_CREDENTIALS.host}`);

            console.log(`Deleting CatGoldAward content`);
            await conn.createQueryBuilder().delete().from(CatGoldAward).execute();

            console.log(`Deleting AdventureGoldAward content`);
            await conn.createQueryBuilder().delete().from(AdventureGoldAward).execute();

            console.log(`Deleting StakedPet content`);
            await conn.createQueryBuilder().delete().from(StakedPet).execute();

            console.log(`Deleting GoldTransaction content`);
            await conn.createQueryBuilder().delete().from(GoldTransaction).execute();

            console.log(`Deleting Nonce content`);
            await conn.createQueryBuilder().delete().from(Nonce).execute();

            console.log(`Deleting PetUserItem content`);
            await conn.createQueryBuilder().delete().from(PetUserItem).execute();

            console.log(`Deleting MarketplaceListing content`);
            await conn.createQueryBuilder().delete().from(MarketplaceListing).execute();

            console.log(`Deleting QuestHistory content`);
            await conn.createQueryBuilder().delete().from(QuestHistory).execute();

            console.log(`Deleting QuestSelection content`);
            await conn.createQueryBuilder().delete().from(QuestSelection).execute();

            console.log(`Deleting QuestTheme content`);
            await conn.createQueryBuilder().delete().from(QuestTheme).execute();

            console.log(`Deleting QuestIo content`);
            await conn.createQueryBuilder().delete().from(QuestIo).execute();

            console.log(`Deleting PetInteraction content`);
            await conn.createQueryBuilder().delete().from(PetInteraction).execute();

            console.log(`Deleting PetItem content`);
            await conn.createQueryBuilder().delete().from(PetItem).execute();

            console.log(`Deleting PetType content`);
            await conn.createQueryBuilder().delete().from(PetType).execute();

            console.log(`Deleting PetCategory content`);
            await conn.createQueryBuilder().delete().from(PetCategory).execute();

            console.log(`Deleting UserProperty content`);
            await conn.createQueryBuilder().delete().from(UserProperty).execute();

            console.log(`Deleting User content`);
            await conn.createQueryBuilder().delete().from(User).execute();

        } catch (error) {
            console.log(error);
        }
    }

  public static async syncAllPetStages(): Promise<void> {
      const coolPetRepository = getRepository<Coolpets>(Coolpets);

      const allMintedPets: Coolpets[] = await coolPetRepository.find();
      const petTokenIds: number[] = allMintedPets.map((pet) => {
          return pet.token_id;
      })

      for (let i = 0; i < petTokenIds.length; i++) {
          const coolPet = allMintedPets[i];
          const tokenId = petTokenIds[i];

          let stage: number | undefined = await Util.getPetStage(tokenId);
          if (!stage) {
              console.log(`syncAllPetStages: Unable to get stage from blockchain for pet id ${tokenId}`);
          }

          let stageString = "";
          switch (stage) {
              case 0:
                  stageString = "egg";
                  break;
              case 1:
                  stageString = "blob1";
                  break;
              case 2:
                  stageString = "blob2";
                  break;
              case 3:
                  stageString = "final_form";
                  break;
          }
          coolPet.stage = stageString;
      }
      await coolPetRepository.save<Coolpets>(allMintedPets);
  }

    public static async syncPetStage(petTokenId: number): Promise<void> {
        const coolPetRepository = getRepository<Coolpets>(Coolpets);

        const coolPet: Coolpets | undefined = await coolPetRepository.findOne({
            where: {
                token_id: petTokenId
            }
        });
        if (!coolPet) {
            throw new Error(`syncPetStage: Could not find Coolpet record for id ${petTokenId}`);
        }

        let stage: number | undefined = await Util.getPetStage(petTokenId);
        if (!stage) {
            console.log(`syncAllPetStages: Unable to get stage from blockchain for pet id ${petTokenId}`);
        }

        let stageString = "";
        switch (stage) {
            case 0:
                stageString = "egg";
                break;
            case 1:
                stageString = "blob1";
                break;
            case 2:
                stageString = "blob2";
                break;
            case 3:
                stageString = "final_form";
                break;
        }
        coolPet.stage = stageString;

        await coolPetRepository.save<Coolpets>(coolPet);
    }
}
