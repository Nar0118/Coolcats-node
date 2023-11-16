/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {getManager} from 'typeorm';
import {TokenTransfer} from '../entity/token-transfer';
import {CoolcatOwner} from '../entity/coolcat-owner';
import {Repository} from 'typeorm/repository/Repository';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetManagerService} from '../services/pet-manager.service';
import {Util} from '../utility/util';
import type Web3 from 'web3'

export class ERC721 extends ContractListener {

    constructor(pusherService: PusherService, private ownerRepository: Repository<CoolcatOwner>, onTransfer?: (tokenId: number, from: string, to: string) => void) {
        super(pusherService, onTransfer);
    }

    /**
     * Event parser for ERC1155 contracts
     * @param events
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {

        if (events.length > 0) {
            for (const event of events) {

                // Pull data from logs if event missing (if we can)
                if (event && (!event.returnValues || Object.keys(event.returnValues).length === 0)) {
                    if (event.raw && event.raw.topics && event.raw.topics.length === 4) {
                        if (event.raw.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                            // We have a transfer event
                            const from: string = `0x${event.raw.topics[1].slice(26)}`;
                            const to: string = `0x${event.raw.topics[2].slice(26)}`;
                            const tokenId: number = parseInt(event.raw.topics[3], 16);
                            event.returnValues = {
                                from, to, tokenId
                            };
                            event.event = 'Transfer';
                        }
                    }
                }

                if (event.hasOwnProperty('event') && (event.event === 'Transfer')) {

                    // Validate the returnValues has the right properties
                    const returnValues = event.returnValues;
                    if (returnValues.hasOwnProperty('from') && returnValues.hasOwnProperty('to') && returnValues.hasOwnProperty('tokenId')) {
                        console.log(`From: ${returnValues?.from} to ${returnValues?.to}`);
                        const trxHash = event.transactionHash;
                        const blockNumber = event.blockNumber;
                        const tokenId = returnValues.tokenId;
                        const from: string = returnValues?.from;
                        const to: string = returnValues?.to;

                        // Need to grab the timestamp from the block
                        await Util.sleep(100);
                        const timestamp = await Util.getBlockTimestamp(web3, blockNumber);

                        // Need to grab the transaction now
                        await Util.sleep(100);
                        const transaction: any = await Util.getTransaction(web3, trxHash);

                        try {
                            await getManager().transaction(async transactionalEntityManager => {

                                const intTokenId: number = parseInt(tokenId, 10);

                                // Create the token transfer record
                                const transfer: TokenTransfer = new TokenTransfer();
                                transfer.timestamp = timestamp.toISOString();
                                transfer.trx_hash = trxHash;
                                transfer.block_number = blockNumber;
                                transfer.token_id = intTokenId;
                                transfer.from = from;
                                transfer.to = to;
                                transfer.value = transaction.value;
                                transfer.eth = parseFloat(web3.utils.fromWei(transaction.value));
                                transfer.blockchainContract = blockchainContract;

                                // Find owner record (or create one)
                                let ownerRecord: CoolcatOwner | undefined = await (this.ownerRepository as Repository<any>).findOne({
                                    where: {
                                        token_id: transfer.token_id,
                                        blockchainContract
                                    }
                                });
                                if (!ownerRecord) {
                                    ownerRecord = new CoolcatOwner();
                                    ownerRecord.token_id = parseInt(tokenId, 10);
                                    ownerRecord.blockchainContract = blockchainContract;
                                } else {
                                    console.log('Updating token');
                                }

                                // Update our owner record with this latest transfer
                                ownerRecord.timestamp = transfer.timestamp;
                                ownerRecord.trx_hash = transfer.trx_hash;
                                ownerRecord.block_number = transfer.block_number;
                                ownerRecord.from = transfer.from;
                                ownerRecord.to = transfer.to;
                                ownerRecord.value = transfer.value;
                                ownerRecord.eth = transfer.eth;

                                // Done in a transaction to assure integrity
                                await transactionalEntityManager.save(transfer);
                                await transactionalEntityManager.save(ownerRecord);

                                if (this.onTransfer) {
                                    await this.onTransfer(intTokenId, transfer.from, transfer.to);
                                }

                                const eventType: string = `${blockchainContract.code}_TRANSFER`.replace('_', '');
                                Util.recordCustomEvent(eventType, { from, to });
                                console.log(`Registered ERC 721 ${blockchainContract.code} transfer token: ${tokenId} from ${from} -> to ${to} (eth: ${transfer.eth}) on ${timestamp}`);

                                // Send out pusher messages to both the from and the to
                                let type: string = `${blockchainContract.code}_TRANSFER_FROM`;
                                let eventToSend: string = this.pusherService.eventWithAddress(type, from);
                                await Util.sendPusherMessage(this.pusherService, eventToSend, {
                                    type,
                                    account: from,
                                    tokenId
                                }, 5);
                                type = `${blockchainContract.code}_TRANSFER_TO`;
                                eventToSend = this.pusherService.eventWithAddress(type, to);
                                await Util.sendPusherMessage(this.pusherService, eventToSend, {
                                    type,
                                    account: to,
                                    tokenId
                                }, 5);

                            });
                        } catch (error: any) {
                            if (error.code === 'ER_DUP_ENTRY') {
                                console.log(error.sqlMessage);
                                console.log('Continuing to process blocks...');
                            } else {
                                console.log(`Error recording ${blockchainContract.code} token: ${parseInt(tokenId, 10)}`);
                                const message: string = error && error.message ? error.message : `Unexpected database error in ERC721contract for contract ${blockchainContract.code}`;
                                Util.noticeError('ERC721_TRANSFER_ERROR', { message });

                                // Begin retries in 2 seconds
                                setTimeout(async () => {
                                    await this.retryRecordTokenTransfer(web3, blockchainContract, event, returnValues, 0);
                                }, 2000);
                            }
                        }
                    }
                }
            }
        }

    }

    /**
     * Method to actually perform the retry of recording the token transfer
     * @private
     */
    private async retryRecordTokenTransfer(web3: Web3, blockchainContract: BlockchainContract, event: any, returnValues: any, retriesSoFar: number = 0): Promise<void> {
        console.log(`From: ${returnValues?.from} to ${returnValues?.to}`);
        const trxHash = event.transactionHash;
        const blockNumber = event.blockNumber;
        const tokenId = returnValues.tokenId;
        const from: string = returnValues?.from;
        const to: string = returnValues?.to;

        // Need to grab the timestamp from the block
        await Util.sleep(100);
        const timestamp = await Util.getBlockTimestamp(web3, blockNumber);

        // Need to grab the transaction now
        await Util.sleep(100);
        const transaction: any = await Util.getTransaction(web3, trxHash);

        try {
            await getManager().transaction(async transactionalEntityManager => {

                const intTokenId: number = parseInt(tokenId, 10);

                // Create the token transfer record
                const transfer: TokenTransfer = new TokenTransfer();
                transfer.timestamp = timestamp.toISOString();
                transfer.trx_hash = trxHash;
                transfer.block_number = blockNumber;
                transfer.token_id = intTokenId;
                transfer.from = from;
                transfer.to = to;
                transfer.value = transaction.value;
                transfer.eth = parseFloat(web3.utils.fromWei(transaction.value));
                transfer.blockchainContract = blockchainContract;

                // Find owner record (or create one)
                let ownerRecord: CoolcatOwner | undefined = await (this.ownerRepository as Repository<any>).findOne({
                    where: {
                        token_id: transfer.token_id,
                        blockchainContract
                    }
                });
                if (!ownerRecord) {
                    ownerRecord = new CoolcatOwner();
                    ownerRecord.token_id = parseInt(tokenId, 10);
                    ownerRecord.blockchainContract = blockchainContract;
                } else {
                    console.log('Updating token');
                }

                // Update our owner record with this latest transfer
                ownerRecord.timestamp = transfer.timestamp;
                ownerRecord.trx_hash = transfer.trx_hash;
                ownerRecord.block_number = transfer.block_number;
                ownerRecord.from = transfer.from;
                ownerRecord.to = transfer.to;
                ownerRecord.value = transfer.value;
                ownerRecord.eth = transfer.eth;

                // Done in a transaction to assure integrity
                await transactionalEntityManager.save(transfer);
                await transactionalEntityManager.save(ownerRecord);

                if (this.onTransfer) {
                    await this.onTransfer(intTokenId, transfer.from, transfer.to);
                }

                const eventType: string = `${blockchainContract.code}_TRANSFER`.replace('_', '');
                Util.recordCustomEvent(eventType, { from, to });
                console.log(`Registered ERC 721 ${blockchainContract.code} transfer from ${from} -> to ${to} (eth: ${transfer.eth}) on ${timestamp}`);

                // Send out pusher messages to both the from and the to
                let type: string = `${blockchainContract.code}_TRANSFER_FROM`;
                let eventToSend: string = this.pusherService.eventWithAddress(type, from);
                await Util.sendPusherMessage(this.pusherService, eventToSend, {
                    type,
                    account: from,
                    tokenId
                }, 5);
                type = `${blockchainContract.code}_TRANSFER_TO`;
                eventToSend = this.pusherService.eventWithAddress(type, to);
                await Util.sendPusherMessage(this.pusherService, eventToSend, {
                    type,
                    account: to,
                    tokenId
                }, 5);

            });
        } catch (error: any) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.log(error.sqlMessage);
                console.log('Continuing to process blocks...');
            } else {
                console.log(`Error retry of recording ${blockchainContract.code} token: ${parseInt(tokenId, 10)}`);
                const message: string = error && error.message ? error.message : `Unexpected database error in ERC721contract for contract ${blockchainContract.code}`;
                Util.noticeError(error, { message });
                if (retriesSoFar <= 6) {
                    retriesSoFar++;
                    const retryDelay = 1000 * Math.pow(2, retriesSoFar);
                    setTimeout(async () => {
                        console.log(`Attempting to retry in ${retryDelay} seconds transfer of ${returnValues.tokenId} from: ${from} to ${to} block number: ${blockNumber}`);
                        await this.retryRecordTokenTransfer(web3, blockchainContract, event, returnValues, retriesSoFar);
                    }, retryDelay);
                } else {
                    console.log(`Failed to record transfer of ${returnValues.tokenId} from: ${from} to ${to} block number: ${blockNumber}`);
                }
            }
        }
    }
}
