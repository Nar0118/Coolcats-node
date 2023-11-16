/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {PusherService} from '../services/pusher.service';
import {PetManagerService} from '../services/pet-manager.service';
import type Web3 from 'web3'
import { EventData } from 'web3/node_modules/web3-eth-contract'

/**
 * Abstract class parent to contract parsers that token-tracker.ts calls out to
 */
export abstract class ContractListener {

    protected onTransfer?: (tokenId: number, from: string, to: string) => void;

    /**
     * Constructor
     * @param pusherService - the pusher service for async notifications to connected clients
     */
    constructor(protected pusherService: PusherService, onTransfer?: (tokenId: number, from: string, to: string) => void) {
        this.onTransfer = onTransfer;
    }

    /**
     * Called to process an event from the blockchain
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     * @param petManager
     */
    public abstract parseEvents(events: EventData[], blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void>;

}
