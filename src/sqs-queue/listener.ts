/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import _ from 'lodash'
import * as ethers from 'ethers'
import {Environment} from '../environment';
import {MessageHandler} from './message-handler';
import {ClaimGoldHandler} from './handlers/claim-gold.handler';
import {DatabaseService} from '../services/database.service';
import {PusherService} from '../services/pusher.service';
import {ConnectUserHandler} from './handlers/connect-user.handler';
import {DisconnectUserHandler} from './handlers/disconnect-user.handler';
import {BuyBoxHandler} from './handlers/buy-box.handler';
import {OpenBoxHandler} from './handlers/open-box.handler';
import {PetInteractionHandler} from './handlers/pet-interaction.handler';
import {EMarketplaceTransaction, MarketplaceHandler} from './handlers/marketplace.handler';
import {Util, RevertError, parseReasonData, randomNonce } from '../utility/util';
import {RollUserQuestHandler} from './handlers/roll-user-quest.handler';
import {CompleteQuestHandler} from "./handlers/complete-quest.handler";
import {ClaimAdventurersGoldHandler} from "./handlers/claim-adventurers-gold.handler";
import {StakeHandler} from "./handlers/stake.handler";
import {UnStakeHandler} from "./handlers/un-stake.handler";
import * as AWS from 'aws-sdk'
import { Consumer } from 'sqs-consumer'
import { RelayerTxReceipt, proto } from '@0xsequence/relayer'
import { Transaction } from '@0xsequence/transactions'
import { abi as MainModuleABI } from './sequencer/abi/MainModule.json'
import { MainModule, TxFailedEvent } from './sequencer/types/modules/MainModule';
import { Wallet } from '@0xsequence/wallet';
import { BuyActionHandler } from './handlers/buy-action.handler';
/**
 * Class to continually poll the SQS coolcats.fifo queue and process messages
 */

type MetaTransactionResponseException = {
    receipt: proto.MetaTxnReceipt
}
// get contract to parse logs
const contract = new ethers.Contract(ethers.constants.AddressZero, MainModuleABI) as MainModule

// type FullTxReceipt = (
//     TransactionResponse<RelayerTxReceipt> & {
//         wait: () => Promise<TransactionResponse<RelayerTxReceipt>>;
//     }
// );
const TX_FAILED = '0x3dbd1590ea96dd3253a91f24e64e3a502e1225d602a5731357bc12643070ccd7'
const TX_EXECUTED = '0x00' // non falsey value
type LogStatus = {
    topic: string;
    log: ethers.providers.Log;
}
const parseIndividualTxStatus = (logs: ethers.providers.Log[]) => {
    return logs.reduce((memo, log) => {
        const topic = !log.topics.length ? TX_EXECUTED : (
            log.topics.includes(TX_FAILED) ? TX_FAILED : null
        )
        if (topic) {
            memo.push({
                topic,
                log,
            })
        }
        return memo
    }, [] as LogStatus[])
}

export class Listener {

    protected sqsConsumer: Consumer;

    constructor(private database: DatabaseService, private pusher: PusherService) {
        AWS.config.update({ region: Environment.env.AWS_REGION });
        this.sqsConsumer = Consumer.create({
            queueUrl: Environment.env.AWS_SQS_URL,
            batchSize: 10,
            handleMessageBatch: this.handleMessageBatch.bind(this),
            sqs: new AWS.SQS(),
            attributeNames: [
                'MessageId',
                'ReceiptHandle',
                'MD5OfBody',
                'Body',
                'MessageGroupId',
            ],
            // heartbeatInterval: 400,
            // // if it takes longer than 1 seconds to process the transaction
            // // or to see it fail, then send it to another consumer
            // // to attempt the transaction again
            // visibilityTimeout: 1 * 1000,
            // waitTimeSeconds: 0.1,
        });

        this.sqsConsumer.on('error', (err: any) => {
            console.log('==================== SQS ERROR =================');
            console.log(err.message);
            console.log('==================== SQS ERROR =================');
        });

        this.sqsConsumer.on('processing_error', (err: any) => {
            console.log('==================== PROCESSING SQS ERROR =================');
            console.log(err);
            console.log('==================== PROCESSING SQS ERROR =================');
        });
    }

    start(): void {
        console.log('SQS listener running...');
        this.sqsConsumer.start();
    }

    async catchFailure<T extends any>(messageHandler: MessageHandler, fn: () => Promise<T>) {
        try {
            return await fn()
        } catch (err) {
            // if we hit a failure subsequent steps will not be run
            this.onFailure(messageHandler, err as RevertError)
        }
    }

    async initMessageHandlers(messages: AWS.SQS.Message[], batchTimestamp: Date = new Date()) {
        const initedMessages = await Promise.all(messages.map(async (message) => {
            const ourMessage: any = JSON.parse(message.Body || '{}');
            Util.recordCustomEvent('SQSMessage', {type: ourMessage.type});
            const messageHandler = messageHandlerFromMessage(batchTimestamp, this.database, this.pusher, ourMessage)
            if (!messageHandler) {
              return
            }
            console.log(`Received ${messageHandler?.abiCode} message GUID: ${ourMessage.guid}`)
            // If we have a handler, execute it
            return this.catchFailure<MessageHandler>(messageHandler, async () => (
                messageHandler.init()
            ))
        }))
        return initedMessages.filter((msg): msg is MessageHandler => !!msg)
    }

    async processMessages(handlers: MessageHandler[]): Promise<[MessageHandler, Transaction[]][]> {
        if (!handlers.length) {
            return Promise.all([])
        }
        return Promise.all(handlers.map(async (handler) => (
            this.catchFailure(handler, async () => (
                [handler, await handler.processMessage()] as [MessageHandler, Transaction[]]
            ))
        ))).then((items) => _.compact(items))
    }

    logCatch(message: string) {
        return (err: RevertError) => {
            console.log(message, err)
            throw err
        }
    }

    /**
     * handles multiple messages from the sqs queue as a batch
     * @param messages a list of messages from the sqs queue
     * @returns void
     */
    async handleMessageBatch(messages: AWS.SQS.Message[]): Promise<void> {
        const batchTimestamp = new Date()
        const batchISO = batchTimestamp.toISOString()

        const groups = _.keyBy(messages, 'Attributes.MessageGroupId')
        console.log(`batch: ${batchISO} - ${Object.keys(groups).join(',')}`)

        const initProfileLog = `batch ${batchISO} - gathering data for ${messages.length} messages`
        const messageHandlers = await profile<MessageHandler[]>(initProfileLog, () => (
            this.initMessageHandlers(messages, batchTimestamp)
        ))

        if (!messageHandlers.length) {
            return
        }

        const processProfileLog = `batch ${batchISO} - handling ${messageHandlers.length} messages`
        const processEntries = await profile<[MessageHandler, Transaction[]][]>(processProfileLog, () => (
            this.processMessages(messageHandlers)
        ))
        if (!processEntries.length) {
            return
        }
        const [firstMessageHandler] = processEntries[0]
        const maxGrouping = firstMessageHandler.maxGrouping()
        const wallet = await firstMessageHandler.getSequencerWallet()
        const transactions = processEntries.reduce((allTxs, [handler, txs]) => {
            return allTxs.concat(txs)
        }, [] as Transaction[])
        const chunks = _.chunk(transactions, maxGrouping).map((chunk) => {
            const nonce = randomNonce()
            const fullTxs = chunk.map((tx) => ({
                nonce,
                gasLimit: 0,
                revertOnError: false,
                ...tx,
            }))
            return fullTxs
        })
        // const gasLimited = await wallet.relayer.estimateGasLimits(wallet.config, wallet.context, ...transactions)
        // after this point we are operating in memory-only land
        await profile(`batch ${batchISO} - sending tx to relayer`, async () => (
            Promise.all(chunks.map((metaTxs) => (
                wallet.sendTransactionBatchToRelayer(metaTxs)
            ))).then(async (nativeTxs) => {
                const mempoolTxHashes = nativeTxs.map(({ txnHash }) => txnHash)
                console.log('mining txs', mempoolTxHashes)
                await Promise.all(_.map(processEntries, ([handler]) => (
                    handler.onSent()
                )))
                // no awaiting for .wait()
                this.waitForResolution(wallet, nativeTxs, processEntries)
            }).catch((err) => {
                console.error(err)
                throw err
            })
        ))
    }
    async waitForResolution(wallet: Wallet, mempoolTxs: proto.SendMetaTxnReturn[], processEntries: [MessageHandler, Transaction[]][]) {
        const receipts = await Promise.all(mempoolTxs.map((tx) => (
            wallet.relayer.wait(tx.txnHash)
                .then((tx) => tx.receipt as RelayerTxReceipt)
                // as long as we catch here, we don't have to worry about
                // grouping correctly because we are maintaining original order
                .catch((err) => {
                    const e = err as MetaTransactionResponseException
                    const txnReceipt = JSON.parse(e.receipt.txnReceipt as string)
                    return txnReceipt as RelayerTxReceipt
                })
        )))
        const hashes = receipts.map(({ transactionHash }) => transactionHash)
        console.log('txs mined', hashes)
        // get logs from receipts
        const rawLogs = _.compact(_.flatMap(receipts, ({ logs }) => logs))
        // convert to ethers compatable type
        const logs = rawLogs.map((log) => ({
            ...log,
            blockNumber: parseInt(log.blockNumber),
            transactionIndex: parseInt(log.transactionIndex),
            logIndex: parseInt(log.logIndex),
        })) as ethers.providers.Log[]
        // get only success / failures
        const onlySuccessOrFailures = parseIndividualTxStatus(logs)
        if (!onlySuccessOrFailures.length) {
            // assume gas out for the tx
            return await Promise.all(processEntries.map(([handler]) => (
                this.catchFailure(handler, async () => {
                    throw new Error('Unable to complete transaction: Out of Gas. Please try again')
                })
            )))
        }
        // this is a short term sanity check while we are
        // feeling out sequence.info's repos
        const innerTxs = _.flatMap(processEntries, ([_handler, txs]) => txs)
        if (onlySuccessOrFailures.length !== innerTxs.length) {
            console.log('MISMATCH_FAILURES', JSON.stringify(onlySuccessOrFailures, null, 2))
        }
        // signal back to client that their tx is done
        const handlerToIndex = processEntries.reduce((mapping, [handler], index, all) => {
            if (index) {
                const [previousHandler, previousTxs] = all[index - 1]
                const previousIndex = mapping.get(previousHandler) as number
                const startIndex = previousIndex + previousTxs.length
                mapping.set(handler, startIndex)
            } else {
                mapping.set(handler, 0)
            }
            return mapping
        }, new Map<MessageHandler, number>())
        return await Promise.all(processEntries.map(async ([handler, txs]) => (
            this.catchFailure(handler, async () => (
                // check that each piece of the tx (usually only 1)
                // did not fail, if it did, then throw the reason
                // or default for that handler
                Promise.all(txs.map(async (_tx, innerIndex) => {
                    const flattenedIndex = (handlerToIndex.get(handler) as number) + innerIndex
                    const logState = onlySuccessOrFailures[flattenedIndex]
                    if (logState.topic === TX_FAILED) {
                        const failureState = contract.interface.parseLog(logState.log) as unknown as TxFailedEvent
                        const reason = parseReasonData(failureState?.args?._reason) // sometimes '0x' -> ''
                        // throw an error so that we don't do
                        // a round trip to check the block height
                        throw new Error(reason || 'Transaction ran out of gas. Please try again')
                    }
                })).then(async () => {
                    // notify the front end that all
                    // parts of tx were successful
                    await handler.onSuccess()
                })
            ))
        )))
    }
    async onFailure(messageHandler: MessageHandler, err: RevertError): Promise<void> {
        try {
            console.log('caught error', err)
            await messageHandler.onFailure(err)
        } catch (extraError: unknown) {
            console.log('failed to notify client', extraError)

            const message = messageHandler.msg()
            console.log(`>>>>>>>>>> ERROR PROCESSING SQS MESSAGE ${message.type} >>>>>>>>>>`)
            console.log(err)
            console.log(`<<<<<<<<<< ERROR PROCESSING SQS MESSAGE ${message.type} <<<<<<<<<<`)

            const msg: string = err && err.message ? err.message : `>>>>>>>>>> ERROR PROCESSING SQS MESSAGE ${message.type} >>>>>>>>>>`
            Util.noticeError(err, { message: msg })
        }
    }
}

const profile = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const uniqueKey: string = `${key}-${Date.now().toString()}`;
  console.time(uniqueKey);
  const result: T = await fn()
  console.timeEnd(uniqueKey);
  return result
}

const messageHandlerFromMessage = (
    batchTimestamp: Date,
    database: DatabaseService,
    pusher: PusherService,
    message: any,
): MessageHandler | undefined => {
  switch (message.type) {
    case 'CLAIM_GOLD':
        return new ClaimGoldHandler(batchTimestamp, database, pusher, message)
    case 'CONNECT_USER':
        return new ConnectUserHandler(batchTimestamp, database, pusher, message)
    case 'DISCONNECT_USER':
        return new DisconnectUserHandler(batchTimestamp, database, pusher, message)
    case 'BUY_BOX':
        return new BuyBoxHandler(batchTimestamp, database, pusher, message)
    case 'BUY_ACTION':
         return new BuyActionHandler(batchTimestamp, database, pusher, message)
    case 'OPEN_BOX':
        return new OpenBoxHandler(batchTimestamp, database, pusher, message)
    case 'PET_INTERACTION':
        message.petTokenId = parseInt(message.petTokenId as unknown as string)
        message.itemTokenId = parseInt(message.itemTokenId as unknown as string)
        return new PetInteractionHandler(batchTimestamp, database, pusher, message)
    case 'CREATE_LISTING':
        // Add properties to make the pusher message sent out consistent with others
        // as this.message is used as the message parameter in pusher messages sent
        // in the process() method.
        message.type = EMarketplaceTransaction.CREATE_LISTING
        message.messageGuid = message.guid.slice(2)
        return new MarketplaceHandler(batchTimestamp, database, pusher, message)
    case 'REMOVE_LISTING':
        message.type = EMarketplaceTransaction.REMOVE_LISTING
        message.messageGuid = message.guid.slice(2)
        return new MarketplaceHandler(batchTimestamp, database, pusher, message)
    case 'BUY_LISTING':
        message.type = EMarketplaceTransaction.BUY_LISTING
        message.messageGuid = message.guid.slice(2)
        return new MarketplaceHandler(batchTimestamp, database, pusher, message)
    case 'ROLL_USER_QUEST':
        return new RollUserQuestHandler(batchTimestamp, database, pusher, message)
    case 'COMPLETE_QUEST':
        return new CompleteQuestHandler(batchTimestamp, database, pusher, message)
    case 'CLAIM_ADVENTURE_GOLD':
        return new ClaimAdventurersGoldHandler(batchTimestamp, database, pusher, message)
    case 'STAKE_PET':
        return new StakeHandler(batchTimestamp, database, pusher, message)
    case 'UN_STAKE_PET':
        return new UnStakeHandler(batchTimestamp, database, pusher, message)
  }
}
