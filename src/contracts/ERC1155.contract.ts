/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {TokenTransfer} from '../entity/token-transfer';
import {BlockchainContract} from '../entity/blockchain-contract';
import {ContractListener} from './contract-listener.contract'
import {DatabaseService} from '../services/database.service';
import {PusherService} from '../services/pusher.service';
import {Repository} from "typeorm/repository/Repository";
import {PetManagerService} from '../services/pet-manager.service';
import {Util} from '../utility/util';
import type Web3 from 'web3'

export class ERC1155 extends ContractListener {

    constructor(private tokenId: string, pusherService: PusherService, ownerRepository?: Repository<any>) {
        super(pusherService);
    }

    /**
     * Event parser for ERC1155 contracts
     * @param events
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

                    if (returnValues.hasOwnProperty('id')) {
                        const id: string = returnValues.id;
                        if (id === this.tokenId) {
                            const eventName = ourEvent.event;
                            if ((eventName === 'TransferSingle' || eventName === 'TransferBatch')) {
                                // We have found a transfer of a token
                                const trxHash = ourEvent.transactionHash;
                                const blockNumber = ourEvent.blockNumber;
                                const operator: string = returnValues?.operator;
                                const from: string = returnValues?.from;
                                const to: string = returnValues?.to;
                                const value: string = returnValues?.value;

                                // Need to grab the timestamp from the block
                                await Util.sleep(100);
                                await web3.eth.getBlock(blockNumber, true, async (error: any, result: any) => {
                                    if (!error) {
                                        const timestamp: string = new Date(result.timestamp * 1000).toISOString();

                                        // Need to grab the transaction receipt to get the value of the transaction
                                        await Util.sleep(100);
                                        await web3.eth.getTransaction(trxHash, async (error: any, result: any) => {
                                            if (!error) {
                                                const transfer: TokenTransfer = new TokenTransfer();
                                                transfer.timestamp = timestamp;
                                                transfer.trx_hash = trxHash;
                                                transfer.block_number = blockNumber;
                                                transfer.from = from;
                                                transfer.to = to;
                                                transfer.value = value;
                                                transfer.eth = parseFloat(web3.utils.fromWei(result.value));
                                                transfer.blockchainContract = blockchainContract;
                                                try {
                                                    await database.connection.manager.save(transfer);
                                                    console.log(`Registered transfer from ${from} -> to ${to} of ${value} on ${timestamp}`)
                                                } catch (error: any) {
                                                    if (error.code === 'ER_DUP_ENTRY') {
                                                        console.log(error.sqlMessage);
                                                        console.log('Continuing to process blocks...');
                                                    } else {
                                                        throw (error);
                                                    }
                                                }
                                            }  else {
                                                console.log('Error attempting to get transaction receipt on transfer event');
                                            }
                                        });
                                    } else {
                                        console.log('Error attempting to get timestamp for block on transfer event');
                                    }
                                });

                            }
                        }
                    }
                }
            }
        }
    }
}
