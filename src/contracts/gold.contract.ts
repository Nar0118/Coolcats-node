/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {TokenTransfer} from '../entity/token-transfer';
import {PusherService} from '../services/pusher.service';
import {Util} from '../utility/util';
import {PetManagerService} from '../services/pet-manager.service';
import type Web3 from 'web3'

export class GoldContract extends ContractListener {

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the GOLD_CONTRACT
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

                    // -------------------------
                    // Handle the transfer event
                    // -------------------------
                    if (ourEvent.event === 'Transfer') {
                        // We have found a transfer of a token
                        const trxHash = ourEvent.transactionHash;
                        const blockNumber = ourEvent.blockNumber;
                        const from: string = returnValues?.from;
                        const to: string = returnValues?.to;
                        const value: string = returnValues?.value;

                        // Need to grab the timestamp from the block
                        const timestamp = await Util.getBlockTimestamp(web3, blockNumber);

                        try {
                            const tx: any = await web3.eth.getTransaction(trxHash);
                            const transfer: TokenTransfer = new TokenTransfer();
                            transfer.timestamp = timestamp.toISOString();
                            transfer.trx_hash = trxHash;
                            transfer.block_number = blockNumber;
                            transfer.from = from;
                            transfer.to = to;
                            transfer.value = tx.value;
                            transfer.eth = parseFloat(web3.utils.fromWei(tx.value));
                            transfer.blockchainContract = blockchainContract;
                            await database.connection.manager.save(transfer);
                            console.log(`Registered transfer from ${from} -> to ${to} of ${value} on ${timestamp}`);
                        } catch (err: any) {
                            const message: string = err && err.message ? err.message : `Failed to store transfer of gold token from ${from} -> to ${to}`;
                            Util.noticeError(new Error(message), { message });
                            console.log(message);
                        }
                    }
                }
            }
        }
    }
}
