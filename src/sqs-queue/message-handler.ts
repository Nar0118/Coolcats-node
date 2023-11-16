/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import _ from 'lodash'
import * as ethers from 'ethers'
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {PusherService} from '../services/pusher.service';
import {
    getWallet,
    RevertError,
    getSequencerWallet,
} from '../utility/util'
import {
    getProviderURL,
    getProvider,
    getContract,
    getNextNonceForMessage,
    type BaseMessage,
} from './utils'
import { encodeNonce, Transaction } from '@0xsequence/transactions'

export abstract class MessageHandler {
    protected provider: ethers.providers.Provider;
    protected blockchainContract: BlockchainContract;
    protected abi: ethers.ContractInterface;
    protected address: string;
    protected signer: ethers.Signer;
    public _nonce: number;
    protected contract: ethers.Contract;
    /**
     * sometimes messages need some entropy
     */
    private entropy: number;
    protected entropyMultiplier: number = 100_000;
    constructor(
        protected batchTimestamp: Date,
        protected databaseService: DatabaseService,
        protected pusherService: PusherService,
        protected message: BaseMessage,
    ) {
    }

    maxGrouping() {
        return 10
    }

    /**
     * Initializes the message handler
     * @protected
     */
    public async init(): Promise<MessageHandler> {
        try {
            const { address, providers, parsedAbi } = await getContract(this.abiCode)
            this.abi = parsedAbi
            this.address = address
            // const providerIndex = 0 // Math.floor(Math.random() * providers.length)
            const providerURL = getProviderURL(providers)
            this.provider = getProvider(providerURL)
            // do not await for this as requests will stack up anyway
            this.connect(await getWallet(providerURL, this.provider))
            this.toContract()
            return this
        } catch (err) {
            console.log(err)
            throw err
        }
    }

    msg<T extends BaseMessage>() {
        return this.message as T
    }

    getSigner() {
        return this.signer
    }

    public connect(signer: ethers.Signer) {
        this.signer = signer
    }

    public getProvider() {
        return this.provider
    }

    protected toContract<T extends ethers.Contract>(refresh?: boolean): T {
        if (this.contract && refresh !== true) {
            return this.contract as T
        }
        const contract = new ethers.Contract(this.address, this.abi, this.signer)
        this.contract = contract
        return contract as T
    }

    protected async getNextNonce(refresh?: boolean): Promise<number> {
        return getNextNonceForMessage(
            await this.signer.getAddress(),
            this,
            this.signer,
            refresh,
        )
    }

    async getNonce() {
        return this.getNextNonce()
    }

    /**
     * Process a given message handler with a particular gas limit.
     */
    async processMessage(): Promise<Transaction[]> {
        const calldata = await this.process()
        const gasLimit = await this.gasLimit()
        const to = this.to()

        return calldata.map((data) => ({
            to,
            data,
            gasLimit,
        }))
    }

    async gasLimit() {
        return 0
    }

    guid() {
        return this.msg().guid
    }

    generateEntropy() {
        return Math.floor(Math.random() * this.entropyMultiplier)
    }

    getEntropy(): number {
        const entropy = this.entropy || this.generateEntropy()
        this.entropy = entropy
        return this.entropy
    }

    nonce() {
        return encodeNonce(ethers.BigNumber.from(ethers.utils.hexlify(ethers.utils.randomBytes(20))), 0)
    }

    to() {
        return this.contract.address
    }

    async getSequencerWallet() {
        const signer = this.getSigner()
        return getSequencerWallet(await signer.getAddress(), signer, this.getProvider())
    }

    async onSent() {}

    public abstract process(): Promise<string[]>;
    public abstract abiCode: string;
    public abstract onSuccess(): Promise<void>;
    public abstract origin(): string;
    public abstract failureMessage(): object;
    public abstract onFailure(err: RevertError): Promise<void>;
}
