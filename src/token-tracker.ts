/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {BlockchainContract} from './entity/blockchain-contract';
import _ from 'lodash'
import Web3 from 'web3'
import { Contract, EventData } from 'web3/node_modules/web3-eth-contract'
import crypto from 'crypto-js'
import {DatabaseService} from './services/database.service';
import {Repository} from 'typeorm/repository/Repository';
import {CoolcatOwner} from './entity/coolcat-owner';
import {ContractListener} from './contracts/contract-listener.contract';
import {PusherService} from './services/pusher.service';
import {Config} from './config';
import {PetManagerService} from './services/pet-manager.service';
import {Util, getWeb3} from './utility/util';
import {App} from './app';

interface IProviderGroup {
    providerGroupKey: string;
    currentIndex: number;
    providers: Web3[];
}

export class TokenTracker {

    private contractInstance: Contract;
    private web3: Web3;
    private contractRepository: Repository<BlockchainContract>;
    private ownerRepository: Repository<CoolcatOwner>;
    private blockchainHeadBlock: number = 0;
    private providerGroupKey: string;
    private providersRemainingToTry: number;

    // Static members that keep track of token trackers by provider and store a single web3 object for a given provider
    private static _web3Map: any = {};
    public static _tokenTrackers: TokenTracker[] = new Array<TokenTracker>();

    /**
     * Creates a provider key from an array of providers from different vendors
     * @param providers
     */
    public static generateProviderGroupKey(providers: string[]): string {
        let providerKey: string = '';
        providers.forEach((provider: string, idx: number) => {
           providerKey = providerKey + provider;
        });
        return crypto.SHA256(providerKey).toString();
    }

    /**
     * Increments the provider index and wraps it if necessary
     * @param tokenTrackerIn
     * @private
     */
    private static incrementProviderIndex(tokenTrackerIn: TokenTracker): void {
        const providerGroup: IProviderGroup = TokenTracker._web3Map[tokenTrackerIn.providerGroupKey];
        providerGroup.currentIndex++;
        if (providerGroup.currentIndex === providerGroup.providers.length) {
            providerGroup.currentIndex = 0;
        }
        tokenTrackerIn.providersRemainingToTry--;

        // Update all the token trackers to point at the new provider
        TokenTracker._tokenTrackers.forEach((tt: TokenTracker) => {
            tt.updateWeb3AndContract();
        });
    }

    /**
     * Returns the count of providers for a given token tracker
     * @param tokenTrackerIn
     * @private
     */
    private static providerCount(tokenTrackerIn: TokenTracker): number {
        return TokenTracker._web3Map[tokenTrackerIn.providerGroupKey].providers.length;
    }

    /**
     * Returns the current provider endpoint
     * @param tokenTrackerIn
     * @private
     */
    private static currentProviderEndpoint(tokenTrackerIn: TokenTracker): string {
        const providerGroup: IProviderGroup = TokenTracker._web3Map[tokenTrackerIn.providerGroupKey];
        return tokenTrackerIn.providers[providerGroup.currentIndex];
    }

    /**
     * Returns the current provider for a given token tracker
     * @param tokenTrackerIn
     * @private
     */
    private static currentProvider(tokenTrackerIn: TokenTracker): any {
        return TokenTracker._web3Map[tokenTrackerIn.providerGroupKey].providers[TokenTracker._web3Map[tokenTrackerIn.providerGroupKey].currentIndex];
    }

    /**
     * Returns the current provider for a given token tracker
     * @param tokenTrackerIn
     * @private
     */
    public static currentProviderFromKey(key: string): any {
        let toRet: any;
        try {
            toRet = TokenTracker._web3Map[key].providers[TokenTracker._web3Map[key].currentIndex];
        } catch (error) {
            return undefined;
        }
        return toRet;
    }


    /**
     * Static member that holds our web3 map keyed by provider. Also starts a single timer
     * for that provider that will inject the current block number to all token tracker instances
     * that use that provider. That way we are not banging at the provider for the same data
     * for each instance of the token tracker.
     *
     * @param provider
     * @private
     */
    private static addProvidersFromTokenTracker(tokenTrackerIn: TokenTracker): void {

        let providerGroupKey: string = TokenTracker.generateProviderGroupKey(tokenTrackerIn.providers);
        if (!TokenTracker._web3Map.hasOwnProperty(providerGroupKey)) {

            // This is the first time we have seen this provider group, so we create the
            // specified web3 objects and put them into our array.
            const providers = tokenTrackerIn.providers.map(provider => getWeb3(provider))
            let providerGroup: IProviderGroup = {
               providerGroupKey,
               currentIndex: 0,
               providers,
            };
            TokenTracker._web3Map[providerGroupKey] = providerGroup;

            // This local function retrieves and then updates all TokenTracker instances with
            // the lead block of the given provider.
            const updateLeadBlockNumber: () => void = async () => {
                const providerGroup: IProviderGroup = TokenTracker._web3Map[providerGroupKey];
                let startIdx: number = providerGroup.currentIndex;
                let done: boolean = false;
                try {
                    const web3: Web3 = TokenTracker.currentProviderFromKey(providerGroupKey);
                    const leadBlockNumber: number = await web3.eth.getBlockNumber();

                    // Update any of our contract listeners that are associated with this providerGroup
                    TokenTracker._tokenTrackers.forEach((tt: TokenTracker) => {
                        if (providerGroupKey === tt.providerGroupKey) {
                            tt.setBlockchainHeadBlock(leadBlockNumber);
                        }
                    });

                    Util.recordCustomEvent('UpdateLeadBlockNumber', { leadBlockNumber });

                    // All good so it again in 10 seconds
                    tokenTrackerIn.providersRemainingToTry = tokenTrackerIn.providers.length;
                    setTimeout(() => {
                        updateLeadBlockNumber();
                    }, 10000);

                } catch (err) {
                    // Great, we have some sort of error getting the lead block, so we will bump our provider
                    // and try with new provider. If we loop them all, all we can do is pause for a longer period
                    // of time and then try to loop them all again.
                    if (tokenTrackerIn.providersRemainingToTry === 0) {
                        // TODO Add notification message to operator (slack or text when we have it)
                        // We have already looped all providers, so let's slow things down and keep trying
                        const errMessage: string = `updateLeadBlockNumber() -> Failed to get the lead block number from any provider for contract code ${tokenTrackerIn.code} trying again in 10 seconds`;
                        console.log(errMessage);

                        Util.noticeError(new Error(errMessage), { message: errMessage });

                        // Try again in 10 seconds
                        setTimeout(() => {
                            tokenTrackerIn.providersRemainingToTry = tokenTrackerIn.providers.length;
                            updateLeadBlockNumber();
                        }, 10000);

                    } else {
                        console.log('----------------------------------------------------');
                        console.log(`Cannot seem to getBlockNumber() using: ${TokenTracker.currentProviderEndpoint(tokenTrackerIn)}`);
                        console.log(`>>> SWITCHING PROVIDERS <<<`);
                        TokenTracker.incrementProviderIndex(tokenTrackerIn);
                        console.log(`Now using provider ${TokenTracker.currentProviderEndpoint(tokenTrackerIn)}`);
                        console.log('----------------------------------------------------');

                        // We bumped the provider index, so let's try again with different vendor immediately
                        setTimeout(() => {
                            updateLeadBlockNumber();
                        }, 0);
                    }
                }

            };

            // Kick things off
            updateLeadBlockNumber();
        }
    }

    // Determines whether or not to continue
    public set run(val: boolean) {
        this.blockchainContract.run_listener = val ? 1 : 0;
    }

    // Returns the code associated with the blockchain contract this token tracking is tracking
    public get code(): string {
        return this.blockchainContract.code;
    }

    /**
     * Constructor for TokenTransfer superclass
     * @param contractListener
     * @param database
     * @param blockchainContract
     * @param currentBlock
     * @param blocksPerQuery
     * @param providers
     * @param contract
     * @param abi
     * @param pusherService
     * @param petManager
     */
    constructor(private contractListener: ContractListener,
                private database: DatabaseService,
                private blockchainContract: BlockchainContract,
                private currentBlock: number,
                private blocksPerQuery: number,
                private providers: string[],
                private contract: string,
                private abi: any,
                private pusherService: PusherService,
                private petManager: PetManagerService) {
        this.contractRepository = this.database.connection.getRepository(BlockchainContract);
        this.providerGroupKey = TokenTracker.generateProviderGroupKey(providers);
        this.providersRemainingToTry = this.providers.length;

        // Adds us to the list of active token trackers
        TokenTracker._tokenTrackers.push(this);

        // Adds our providers to our static provider manager
        TokenTracker.addProvidersFromTokenTracker(this);

        // We blow off the fact that this is an async function with a promise returned (i.e. we do not wait for it)
        this.init();
    }

    /**
     * Updates the web3 object and contract instance to use the currently selected provider
     * @private
     */
    private updateWeb3AndContract(): void {
        this.web3 = TokenTracker.currentProvider(this);
        this.contractInstance = new this.web3.eth.Contract(
            this.abi,
            this.contract
        );
    }

    /**
     * Initializes
     * @private
     */
    private init(): void {

        this.updateWeb3AndContract();

        // Create our ownerRepository for erc 721s
        if (this.blockchainContract.token_id === 'ERC721') {
            this.ownerRepository = this.database.connection.getRepository(CoolcatOwner);
        }

        // Kick the scan of the blockchain off
        setTimeout(() => {
            this.mainProcessLoop();
        }, Math.floor(Math.random() * Config.QUERY_DELAY_MS));
    }

    /**
     * Sets our local copy of the provider's head block number
     * @param val
     * @private
     */
    private setBlockchainHeadBlock(val: number): void {
        this.blockchainHeadBlock = val;
    }

    private async mainProcessLoop(delayMs?: number): Promise<void> {

        // Deal with delayed execution
        if (delayMs) {
            await Util.sleep(delayMs);
        }

        // We will not continue processing if we are not the reader node
        if (!App.SCAN_CONTRACTS) {
            setTimeout(() => {
                this.mainProcessLoop();
            }, 2000);
            return;
        }

        // We will not continue processing if the database shows us as not to be running
        if (this.blockchainContract.run_listener !== 1) {
            setTimeout(() => {
                this.mainProcessLoop();
            }, 2000);
            return;
        }

        // If our currentBlock is past the head of the blockchain,
        // wait 500ms for the head block to be updated
        if (this.currentBlock > this.blockchainHeadBlock) {
            setTimeout(() => {
                this.mainProcessLoop();
            }, 500);
            return;
        }

        // If we get here, we have a range of blocks to grab and inspect.
        const endingBlock: number = this.currentBlock + this.blocksPerQuery > this.blockchainHeadBlock
            ? this.blockchainHeadBlock
            : this.currentBlock + this.blocksPerQuery - 1;
        // console.log(`Processing blocks ${this.currentBlock} -- ${endingBlock} (blockchain head = ${this.blockchainHeadBlock})`);
        this.contractInstance.getPastEvents(
            'allEvents', {
                fromBlock: this.currentBlock,
                toBlock: endingBlock
            }, async (error: any, events: any) => {
                if (!error) {

                    // DEBUG Use next provider
                    // const from:string = TokenTracker.currentProviderEndpoint(this);
                    // TokenTracker.incrementProviderIndex(this);
                    // this.updateWeb3AndContract();
                    // this.providersRemainingToTry = this.providers.length;
                    // console.log(`Flipping providers >>> ${from} -> ${TokenTracker.currentProviderEndpoint(this)}`);

                    // Reset our block query size (in case it was reduced due to an error)
                    this.blocksPerQuery = Config.BLOCKS_PER_QUERY;

                    // Reset our number of providers to try
                    this.providersRemainingToTry = this.providers.length;

                    // Process the events we grabbed
                    try {
                        // this is weird because EventData is not typed as an array
                        const evnts = (_.isArray(events) ? events : [events]) as unknown as EventData[]
                        await this.contractListener.parseEvents(evnts, this.blockchainContract, this.database, this.web3, this.petManager);

                        // All is good, bump our current block to be one past the endingBlock
                        this.currentBlock = endingBlock + 1;

                        // Update our last block in the database
                        // NOTE that last_block is actually the first block to
                        // retrieve the next time.
                        await this.database.connection
                            .createQueryBuilder()
                            .update(BlockchainContract)
                            .set({
                                next_block: this.currentBlock
                            })
                            .where("id = :id", { id: this.blockchainContract.id })
                            .execute();

                        // Continue on our way
                        setTimeout(() => {
                            this.mainProcessLoop();
                        }, Config.QUERY_DELAY_MS);

                    } catch (err: any) {
                        try {
                            // Try to reconnect to the database if we lost the connection
                            if (err.toString().indexOf('The server closed the connection') >= 0) {
                                setTimeout(async () => {
                                    // Try to reconnect to the database in 5 seconds
                                    await this.database.init(() => {
                                        setTimeout(() => {
                                            this.mainProcessLoop();
                                        }, Config.QUERY_DELAY_MS);
                                    });
                                }, 5000);
                                return;
                            }
                        } catch (innerError) { }

                        // TODO Add notification message to operator (slack or text when we have it)
                        console.log(`========= UNEXPECTED ERROR PARSING EVENTS [${this.blockchainContract.description}] =========`);
                        console.log(err);
                        console.log(`========= WILL RESTART PROCESSING BLOCKS IN 10 SECONDS [${this.blockchainContract.description}] =========`);

                        // Continue on our way after 10 seconds after receiving this unexpected error
                        setTimeout(() => {
                            this.mainProcessLoop();
                        }, 10 * 1000);
                    }
                } else {
                    // Problem, log the error and exit the process
                    if (error.code === 'INVALID_ARGUMENT') {
                        // We are hitting a bug in the web3 library, so log the error
                        // invalid codepoint at offset 1; unexpected continuation byte
                        this.blocksPerQuery = Math.floor(this.blocksPerQuery / 2);
                        if (this.blocksPerQuery > 1) {
                            console.log(`Web3 bug ${this.currentBlock} -> ${endingBlock} Retry with ${this.blocksPerQuery} block window.`);
                            setTimeout(() => {
                                this.mainProcessLoop();
                            }, Config.QUERY_DELAY_MS);
                        } else {
                            // Cannot seem to pull blocks from provider any more
                            if (this.providersRemainingToTry > 0) {
                                console.log('----------------------------------------------------');
                                console.log(`INVALID_ARGUMENT error on ${TokenTracker.currentProviderEndpoint(this)}`);
                                console.log(`For contract: ${this.blockchainContract.description}`);
                                console.log(`From Block: ${this.currentBlock} - To Block: ${endingBlock} - BlocksPerQuery: ${ this.blocksPerQuery }`);
                                console.log(`>>> SWITCHING PROVIDERS <<<`);
                                console.log('----------------------------------------------------');
                                this.blocksPerQuery = Config.BLOCKS_PER_QUERY;
                                TokenTracker.incrementProviderIndex(this);
                                this.updateWeb3AndContract();
                                setTimeout(() => {
                                    this.mainProcessLoop();
                                }, 1000);
                            } else {
                                // TODO Add notification message to operator (slack or text when we have it)
                                const message: string = `Token Tracker for ${this.blockchainContract.code} skipping block ${this.currentBlock} due to INVALID_ARGUMENT error`;
                                console.log(message);
                                this.providersRemainingToTry = this.providers.length;
                                this.currentBlock++;

                                Util.noticeError(error, { message });

                                setTimeout(() => {
                                    this.mainProcessLoop(Config.QUERY_DELAY_MS);
                                }, Math.floor(Config.QUERY_DELAY_MS));
                            }
                        }
                    } else {
                        console.log(error.message);

                        // Cut down on the number of blocks we are going to retrieve in the next request
                        this.blocksPerQuery = Math.floor(this.blocksPerQuery / 2);
                        if (this.blocksPerQuery > 1) {
                            // Try to continue with less blocks in our next request
                            setTimeout(() => {
                                this.mainProcessLoop();
                            }, Math.floor(Config.QUERY_DELAY_MS));
                        } else {
                            if (this.providersRemainingToTry > 0) {
                                // Cannot seem to pull blocks from provider any more, so we are going to switch providers
                                console.log('----------------------------------------------------');
                                console.log(`Cannot seem to access past events on the given provider ${TokenTracker.currentProviderEndpoint(this)}`);
                                console.log(`For contract: ${this.blockchainContract.description}`);
                                console.log(`From Block: ${this.currentBlock} - To Block: ${endingBlock} - BlocksPerQuery: ${this.blocksPerQuery}`);
                                console.log(`>>> SWITCHING PROVIDERS <<<`);
                                console.log('----------------------------------------------------');
                                this.blocksPerQuery = Config.BLOCKS_PER_QUERY;
                                TokenTracker.incrementProviderIndex(this);
                                this.updateWeb3AndContract();
                                setTimeout(() => {
                                    this.mainProcessLoop();
                                }, 1000);
                            } else {
                                // TODO Add notification message to operator (slack or text when we have it)
                                const message: string = `Token Tracker for ${this.blockchainContract.code} skipping block ${this.currentBlock} due to unknown error`;
                                console.log(`================= ERROR SKIPPING BLOCK ${this.currentBlock} DUE TO UNKNOWN ERROR =================`);
                                this.providersRemainingToTry = this.providers.length;
                                this.currentBlock++;

                                Util.noticeError(error, { message });

                                setTimeout(() => {
                                    this.mainProcessLoop(Config.QUERY_DELAY_MS);
                                }, Math.floor(Config.QUERY_DELAY_MS));
                            }
                        }
                    }
                }
            });
    }
}
