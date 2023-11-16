/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetManagerService} from '../services/pet-manager.service';
import {Util} from '../utility/util';
import {BigNumber} from "bignumber.js";
import Web3 from "web3";
import {GoldTransaction} from "../entity/gold-transaction";
import {TokenTracker} from "../token-tracker";
import {getManager, getRepository} from "typeorm";
import {StakedPet} from "../entity/staked-pet";
import * as ethers from 'ethers'
import {AdventureGoldAward} from '../entity/adventure-gold-award';
import {getProvider, getProviderURL} from "../sqs-queue/utils";

type TLogAdventuringGoldClaimed = {
    blockNumber: string;
    transactionHash: string;
    returnValues: {
        user: string;
        gold: string;
        time: string;
        uuid: BigNumber;
    }
}

type TLogPetStaked = {
    blockNumber: string;
    transactionHash: string;
    returnValues: {
        user: string;
        tokenIds: number[];
    }
}

type TLogPetUnStaked = {
    blockNumber: string;
    transactionHash: string;
    returnValues: {
        user: string;
        tokenIds: number[];
    }
}

export class AdventurersGuildContract extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    web3: Web3;

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the ADVENTURERS_GUILD
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {

        this.web3 = web3;
        this.blockchainContract = blockchainContract;
        this.database = database;

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

                    const block: any = await web3.eth.getBlock(ourEvent.blockNumber, true);
                    const blockTimestamp: string = new Date(block.timestamp * 1000).toISOString();

                    // Handle the events
                    try {
                        switch (ourEvent.event) {
                            case 'LogAdventuringGoldClaimed':
                                await this.logAdventuringGoldClaimed(ourEvent, blockTimestamp, database, web3, blockchainContract);
                                break;
                            case 'LogPetStaked':
                                await this.logPetStaked(ourEvent, blockTimestamp, database, web3, blockchainContract);
                                break;
                            case 'LogPetUnStaked':
                                await this.logPetUnStaked(ourEvent, blockTimestamp, database, web3, blockchainContract);
                                break;
                        }
                    } catch (err: any) {
                        const message: string = err?.message ? err.message : 'Unknown error';
                        console.log(`=============================================`);
                        console.log(`adventurers-guild contract failed to process event ${ourEvent.event}`);
                        console.log(`Error Message: ${message}`);
                        console.log(`=============================================`);
                        console.log(err);

                        Util.noticeError(err, { message });

                        // Send out a pusher error message if we have a user account to send it to
                        const account: string = ourEvent?.returnValues?.user;
                        if (account) {
                            const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, account);
                            await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
                                event: ourEvent.event,
                                message: err
                            }, 5);
                        }
                    }
                }
            }
        }
    }

    /**
    * event LogAdventuringGoldClaimed(address user, uint256 gold, uint256 time, uint256 uuid);
    *
    * Handle the LogAdventuringGoldClaimed event, update the respective gold transaction with the txn details
    *
    * @param event
    * @param blockTimestamp
    * @param database
    * @param web3
    * @param blockchainContract
    * @private
    */
    private async logAdventuringGoldClaimed(event: TLogAdventuringGoldClaimed, blockTimestamp: string, database: DatabaseService, web3: Web3, blockchainContract: BlockchainContract): Promise<void> {

        let block: any;
        let guid: string | undefined = undefined;
        try {
            block = await web3.eth.getBlock(event.blockNumber, true);
            const bn: BigNumber = new BigNumber(event.returnValues.uuid);
            guid = bn.toString(16);

            // Make sure guid is 64 characters
            const pad: number = 64 - guid.length;
            for (let i: number = 0; i < pad; i++) {
                guid = `0${guid}`;
            }
        } catch (err) {
            // Send error out to pusher
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, event.returnValues.user);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid,
                account: event.returnValues.user,
                errorMessage: `Failed to get block from blockchain on event LogGoldClaimed`
            }, 5);
            return;
        }

        const idsKey: string = `ADVENTURE-CLAIM-GOLD=${guid}`;
        const idsAsString = await Util.redisGet(idsKey);

        // In a transaction, create the GoldTransaction record and a AdventureGoldAward for each Pet id specified
        try {
            await getManager().transaction("SERIALIZABLE", async transactionalEntityManager => {

                // Create our GoldTransaction
                const goldTransaction: GoldTransaction = new GoldTransaction();
                goldTransaction.guid = guid as string;
                goldTransaction.account = event.returnValues.user;
                goldTransaction.description = 'Cool pet GOLD claimed from adventurers guild';
                goldTransaction.blockchainContract = this.blockchainContract;
                goldTransaction.timestamp = Util.mysqlFromDate(new Date(block.timestamp * 1000));
                goldTransaction.block_number = block.number;
                goldTransaction.trx_hash = event.transactionHash;
                goldTransaction.amount = event.returnValues.gold;
                await transactionalEntityManager.save(goldTransaction);

                // Create the award records for the pets (many of these)

                if (idsAsString) {

                    // Get rid of the REDIS value
                    await Util.redisDel(idsKey);

                    const petIds: string[] = idsAsString.split(',');

                    // tslint:disable-next-line:prefer-for-of
                    for (let i = 0; i < petIds.length; i++) {
                        try {
                            const adventureGoldAwards: AdventureGoldAward[] = await transactionalEntityManager.find<AdventureGoldAward>(AdventureGoldAward, {
                                where: {
                                    token_id: petIds[i]
                                }
                            });
                            let adventureGoldAward: AdventureGoldAward;
                            if (!adventureGoldAwards || adventureGoldAwards.length === 0) {
                                adventureGoldAward = new AdventureGoldAward();
                                adventureGoldAward.token_id = parseInt(petIds[i]);
                            } else {
                                adventureGoldAward = adventureGoldAwards[0];
                            }
                            adventureGoldAward.timestamp = goldTransaction.timestamp;
                            adventureGoldAward.gold_transaction = goldTransaction;

                            // Save the adventureGoldAward record for this pet
                            await transactionalEntityManager.save(adventureGoldAward);
                        } catch (error) {
                            console.log(error);
                        }
                    }
                }
            });
        } catch (err) {
            // Send error out to pusher
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, event.returnValues.user);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid,
                account: event.returnValues.user,
                errorMessage: 'Failed to get gold balance from blockchain'
            }, 5);
            return;
        }

        // Grab our current gold balance
        let goldBalance: string = '';
        try {
            // const providerKey: string = TokenTracker.generateProviderGroupKey(blockchainContract.provider.split('|'));
            // const web3: Web3 = TokenTracker.currentProviderFromKey(providerKey);

            const providerUrl = getProviderURL(blockchainContract.provider.split('|'));
            const provider = getProvider(providerUrl);
            goldBalance = await Util.goldBalance(provider, event.returnValues.user);
        } catch (err) {
            console.log("LogAdventuringGoldClaimed goldBalance error:", err);

            // Send error out to pusher
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, event.returnValues.user);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid,
                account: event.returnValues.user,
                errorMessage: 'LogAdventuringGoldClaimed: Failed to get gold balance from blockchain'
            }, 5);
        }

        // SUCCESS - Send out the pusher message for LogAdventuringGoldClaimed
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.ADVENTURE_GOLD_CLAIMED, event.returnValues.user);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            type: 'ADVENTURE_GOLD_CLAIMED',
            messageGuid: guid,
            account: event.returnValues.user,
            goldClaimed: event.returnValues.gold,
            petTokenIds: idsAsString,
            description: 'Cool pet GOLD claimed from adventurers guild',
            goldBalance
        }, 5);
    }

    /**
     * event LogPetStaked(address user, uint256[] tokenIds);
     *
     * Update the StakedPets table to reflect the staked status of the pets passed
     *
     * @param event
     * @param blockTimestamp
     * @param database
     * @param web3
     * @param blockchainContract
     * @private
     */
    private async logPetStaked(event: TLogPetStaked, blockTimestamp: string, database: DatabaseService, web3: Web3, blockchainContract: BlockchainContract): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            try {
                for (let i = 0; i < event.returnValues.tokenIds.length; i++) {
                    const petTokenId = event.returnValues.tokenIds[i];

                    let stakedPet: StakedPet | undefined;
                    stakedPet = await transactionalEntityManager.findOne<StakedPet>(StakedPet,{
                        where: {
                            token_id: petTokenId
                        }});
                    if (!stakedPet) {
                        stakedPet = new StakedPet();
                        stakedPet.token_id = petTokenId;
                    }
                    stakedPet.timestamp = blockTimestamp;

                    stakedPet.staked = true;

                    await transactionalEntityManager.save<StakedPet>(stakedPet);
                }
            } catch (error) {
                throw new Error(`LogPetStaked unable to update pet staked status to true.`)
            }
        });

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.STAKED_PET, event.returnValues.user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'STAKED_PET',
            user: event.returnValues.user,
            tokenIds: event.returnValues.tokenIds,
        }, 5);
    }

    /**
     * event LogPetUnStaked(address user, uint256[] tokenIds);
     *
     * Update the StakedPets table to reflect the un-staked status of the pets passed
     *
     * @param event
     * @param blockTimestamp
     * @param database
     * @param web3
     * @param blockchainContract
     * @private
     */
    private async logPetUnStaked(event: TLogPetUnStaked, blockTimestamp: string, database: DatabaseService, web3: Web3, blockchainContract: BlockchainContract): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            try {
                for (let i = 0; i < event.returnValues.tokenIds.length; i++) {
                    const petTokenId = event.returnValues.tokenIds[i];

                    let stakedPet: StakedPet | undefined;
                    stakedPet = await transactionalEntityManager.findOne<StakedPet>(StakedPet,{
                        where: {
                            token_id: petTokenId,
                            staked: true
                        }});
                    if (!stakedPet) {
                        throw new Error(`Attempted to unstake petID: ${petTokenId} but this pet was not found or not staked`);
                    }

                    // Update the record to mark it as unstaked
                    stakedPet.timestamp = blockTimestamp;
                    stakedPet.staked = false;

                    // Save the updated record
                    await transactionalEntityManager.save<StakedPet>(stakedPet);
                }
            } catch (error) {
                throw new Error(`LogPetUnStaked unable to update pet staked status to false.`)
            }
        });

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.UN_STAKED_PET, event.returnValues.user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'UN_STAKED_PET',
            user: event.returnValues.user,
            tokenIds: event.returnValues.tokenIds,
        }, 5);
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
                        // Couldn't get record for five consecutive seconds, reject
                        reject(new Error(`Could not find matching GoldTransaction: ${guid}`));
                    }
                }
            };

            // Kick things off
            await gt(goldRepository, guid);
        });

    }
}
