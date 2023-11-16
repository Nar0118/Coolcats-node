/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {BigNumber} from 'bignumber.js';
import {GoldTransaction} from '../entity/gold-transaction';
import {Util} from '../utility/util';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetManagerService} from '../services/pet-manager.service';
import {TokenTracker} from '../token-tracker';
import {getManager, getRepository} from 'typeorm';
import {CatGoldAward} from '../entity/cat-gold-award';
import type Web3 from 'web3'
import {getProvider, getProviderURL} from "../sqs-queue/utils";

export class TreasuryContract extends ContractListener {

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the TREASURY
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {
        if (events.length > 0) {
            for (const event in events) {
                if (events.hasOwnProperty(event)) {

                    const ourEvent: any = events[event];

                    // Prepare return values for this event
                    const returnValues = ourEvent.returnValues;
                    let values = '';
                    for (const key in returnValues) {
                        if (returnValues.hasOwnProperty(key)) {
                            if (isNaN(parseInt(key, 10))) {
                                values += '<b>' + key.replace('_', '') + ':</b></br>';
                            }
                            if (isNaN(parseInt(key, 10))) {
                                values += ('' + returnValues[key])
                                    .replace('\n', '</br>')
                                    .split(',').join('</br>') + '</br>';
                            }
                        }
                    }

                    // -----------------------------
                    // Handle the gold claimed event
                    // -----------------------------
                    if (ourEvent.event === 'LogGoldClaimed') {
                        let block: any;
                        let guid: string | undefined = undefined;
                        try {
                            block = await web3.eth.getBlock(ourEvent.blockNumber, true);
                            const bn: BigNumber = new BigNumber(ourEvent.returnValues.uuid);
                            guid = bn.toString(16);

                            // Make sure guid is 64 characters
                            const pad: number = 64 - guid.length;
                            for (let i: number = 0; i < pad; i++) {
                                guid = `0${guid}`;
                            }
                        } catch (error) {
                            // Send error out to pusher
                            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, ourEvent.returnValues.user);
                            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                                messageGuid: guid,
                                account: ourEvent.returnValues.user,
                                errorMessage: `Failed to get block from blockchain on event LogGoldClaimed`
                            }, 5, ourEvent.returnValues.user);
                            return;
                        }

                        // In a transaction, create the GoldTransaction record and a CatGoldAward for each Cat id specified
                        try {
                            await getManager().transaction("SERIALIZABLE", async transactionalEntityManager => {

                                // Save our gold transaction
                                const goldTransaction: GoldTransaction = new GoldTransaction();
                                goldTransaction.guid = guid as string;
                                goldTransaction.account = ourEvent.returnValues.user;
                                goldTransaction.description = 'Cool Cat owner GOLD claimed';
                                goldTransaction.blockchainContract = blockchainContract;
                                goldTransaction.timestamp = Util.mysqlFromDate(new Date(block.timestamp * 1000));
                                goldTransaction.block_number = block.number;
                                goldTransaction.trx_hash = ourEvent.transactionHash;
                                goldTransaction.amount = ourEvent.returnValues.gold;
                                await transactionalEntityManager.save(goldTransaction);

                                // Save IDs of CATs used to generate the award (if we have them)
                                const idsKey: string = `CLAIM-GOLD=${guid}`;
                                const idsAsString = await Util.redisGet(idsKey);
                                if (idsAsString) {

                                    // Get rid of the REDIS value
                                    await Util.redisDel(idsKey);

                                    const catIds: string[] = idsAsString.split(',');

                                    // tslint:disable-next-line:prefer-for-of
                                    for (let i = 0; i < catIds.length; i++) {
                                        try {
                                            const catGoldAwards: CatGoldAward[] = await transactionalEntityManager.find<CatGoldAward>(CatGoldAward, {
                                                where: {
                                                    token_id: parseInt(catIds[i])
                                                }
                                            });
                                            let catGoldAward: CatGoldAward;
                                            if (!catGoldAwards || catGoldAwards.length === 0) {
                                                catGoldAward = new CatGoldAward();
                                                catGoldAward.token_id = parseInt(catIds[i]);
                                            } else {
                                                catGoldAward = catGoldAwards[0];
                                            }
                                            catGoldAward.last_timestamp = goldTransaction.timestamp;
                                            catGoldAward.gold_transaction = goldTransaction;

                                            // Save the catGoldAward record for this cat
                                            await transactionalEntityManager.save<CatGoldAward>(catGoldAward);
                                        } catch (error) {
                                            console.log(error);
                                        }
                                    }
                                }
                            });
                        } catch (err) {
                            // Send error out to pusher
                            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, ourEvent.returnValues.user);
                            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                                messageGuid: guid,
                                account: ourEvent.returnValues.user,
                                errorMessage: 'Failed to get gold balance from blockchain'
                            }, 5, ourEvent.returnValues.user);
                            return;
                        }

                        // Grab our current gold balance
                        let goldBalance: string = '';
                        try {
                            // const providerKey: string = TokenTracker.generateProviderGroupKey(blockchainContract.provider.split('|'));
                            // const web3: Web3 = TokenTracker.currentProviderFromKey(providerKey);

                            const providerUrl = getProviderURL(blockchainContract.provider.split('|'));
                            const provider = getProvider(providerUrl);

                            goldBalance = await Util.goldBalance(provider, ourEvent.returnValues.user);
                        } catch (err) {
                            console.log("LogAdventuringGoldClaimed goldBalance error:", err);


                            // Send error out to pusher
                            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, ourEvent.returnValues.user);
                            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                                messageGuid: guid,
                                account: ourEvent.returnValues.user,
                                errorMessage: 'Failed to get gold balance from blockchain for event LogGoldClaimed'
                            }, 5, ourEvent.returnValues.user);
                        }

                        // SUCCESS - Send out the pusher message for gold-claimed
                        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.GOLD_CLAIMED, ourEvent.returnValues.user);
                        await Util.sendPusherMessage(this.pusherService, eventToSend, {
                            type: 'GOLD_CLAIMED',
                            messageGuid: guid,
                            account: ourEvent.returnValues.user,
                            goldClaimed: ourEvent.returnValues.gold,
                            description: 'Cool Cat owner GOLD claimed',
                            goldBalance
                        }, 5, ourEvent.returnValues.user);
                    }
                }
            }
        }
    }

    /**
     * Method will try to find a matching transaction with the specified guid for five seconds. We will
     * reject the Promise if we cannot find one.
     *
     * @param goldRepository
     * @param guid
     * @private
     */
    private async getGoldTransaction(goldRepository: any, guid: string): Promise<GoldTransaction[]> {
        return new Promise<GoldTransaction[]>(async (resolve, reject) => {

            let retries: number = 5;

            const gt = async (_goldRepository: any, _guid: string): Promise<void> => {
                const result: GoldTransaction[] = await goldRepository.find({
                    where: {
                        guid
                    }
                });
                if (result && result.length === 1) {
                    resolve(result);
                } else {
                    retries--;
                    if (retries >= 0) {
                        setTimeout(async () => {
                            await gt(_goldRepository, _guid);
                        }, 1000);
                    } else {
                        // Couldn't get record for five consective seconds, reject
                        reject(new Error(`Could not find matching GoldTransaction: ${guid}`));
                    }
                }
            };

            // Kick things off
            await gt(goldRepository, guid);
        });

    }
}
