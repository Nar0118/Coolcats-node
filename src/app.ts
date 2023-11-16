/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import { AdventurersGuildContract } from "./contracts/adventurers-guild.contract";

// require('newrelic');

import "reflect-metadata";
import { TokenTracker } from './token-tracker';

import { Environment } from './environment';
import { DatabaseService } from './services/database.service';
import { BlockchainContract } from './entity/blockchain-contract';
import { Repository } from 'typeorm/repository/Repository';
import { ContractListener } from './contracts/contract-listener.contract';
import { ERC1155 } from './contracts/ERC1155.contract';
import { ERC721 } from './contracts/ERC721.contract';
import { Listener } from './sqs-queue/listener';
import { GoldContract } from './contracts/gold.contract';
import { PusherService } from './services/pusher.service';
import { Config } from './config';
import { PetManagerService } from './services/pet-manager.service';
import { CoolcatOwner } from "./entity/coolcat-owner";
import { OpenPetBoxes } from './contracts/open-pet-boxes.contract'
import { ItemFactoryContract } from './contracts/item-factory.contract';
import { PetInteractionContract } from './contracts/pet-interaction.contract';
import { MarketplaceContract } from './contracts/marketplace.contract';
import { QuestContract } from './contracts/quest.contract';
import { TreasuryContract } from "./contracts/treasury.contract";
import { parseAbi, Util } from './utility/util';
import type Web3 from 'web3'
import { LoadKey } from './utility/loadKey';
import { pusher as pusherService } from './common'
import { MilkAction } from "./contracts/milk-action.contract";

export class App {

    private database: DatabaseService;

    private pusher: PusherService;

    private petManager: PetManagerService;

    private contractInstance: any;
    private web3: Web3;

    private currentBlock: number = 0;
    private blockchainHeadBlock: number = 0;

    private blocksPerQuery: number = 0;

    private listeners: Listener[];

    // Set to TRUE if we are supposed to scan the contracts in addition
    // being an SQS consumer. Only one host should be scanning contracts
    public static SCAN_CONTRACTS: boolean = false;

    constructor() {
        // Ignores the promise, execution begins in onConnect() when system account is fetched
        // from AWS secrets and database is connected.
        this.init();
    }

    /**
     * Initializes our app
     * @private
     */
    private async init(): Promise<void> {

        // Merge in our process env vars
        Environment.merge();

        // Grab our system account key from AWS secrets
        try {
            const keys: string = await LoadKey.loadKeyFromAwsSecrets();
            if (keys) {
                Environment.env.SYSTEM_ACCOUNT = keys;
                const key: any = JSON.parse(Environment.env.SYSTEM_ACCOUNT);
                console.log(`------------------`);
                console.log(`LOADED SYSTEM ACCOUNT FROM SECRET ${key.publicAddress}`);
                console.log(`------------------`);
            }
        } catch (err) {
            console.log(`------------------`);
            console.log(`Could not load AWS Secret ${LoadKey.secretNameFromStack(Environment.env.MODE)}`);
            console.log(`------------------`);
        }

        // Connect to the cool cats database at AWS
        this.database = new DatabaseService(this.onConnect.bind(this));

        // Create our pusher service
        this.pusher = pusherService;

        // Create our pet manager service
        this.petManager = new PetManagerService(this.database);
    }

    /**
     * Called when the database has connected
     * @private
     */
    private async onConnect(): Promise<void> {

        // Try to connect to REDIS
        setTimeout(async () => {
            try {
                console.log(`Attempting to connect to REDIS @ ${Environment.env.REDIS_ENDPOINT}:${Environment.env.REDIS_PORT}`);
                await Util.connectToRedis();
                console.log(`SUCCESSFULLY CONNECTED TO REDIS @ ${Environment.env.REDIS_ENDPOINT}:${Environment.env.REDIS_PORT}`);
            } catch (err) {
                console.log(`+========================+`);
                console.log(`| REDIS IS NOT AVAILABLE |`);
                console.log(`+========================+`);

            }
        }, 100);

        console.log('============== VERSION vprodwrk-1.001 2/6/2022 @ 5:21 PM EST ==============');

        if (Environment.env.EC2_HOSTNAME) {
            console.log(`-------------- Running on host: ${Environment.env.EC2_HOSTNAME} --------------`);
        }

        // Make sure our tables are in sync with our entities (use migrations when we go to production)
        // this.database.connection.synchronize(false);

        // Grab all of the contracts / tokens we are supposed to be following ownership of and launch a tracker for them
        // Taking into consideration our "mode" environment var which in the database should either be "prod", "dev", or "sand"
        // matching what is in the database as "mode"
        const contractRepository: Repository<BlockchainContract> = this.database.connection.getRepository(BlockchainContract);
        const allContracts: BlockchainContract[] = await contractRepository.find({
            where: {
                mode: Environment.env.MODE
            }
        });

        // Loop through all of our contracts that we are supposed to be tracking
        for (const contract of allContracts) {
            // Clean up any weird characters in our abi string
            const contractListener: ContractListener | null = this.contractListenerFactory(contract);
            if (contractListener) {
                const abi = parseAbi(contract.abi)

                // Create the array of providers
                const providers: string[] = contract.provider.split('|');
                const tokenTracker: TokenTracker = new TokenTracker(contractListener as ContractListener,
                    this.database,
                    contract,
                    contract.next_block,
                    Config.BLOCKS_PER_QUERY,
                    providers,
                    contract.address,
                    abi,
                    this.pusher,
                    this.petManager);
            }
        }

        // Loop to enable / disable listening on contracts
        setInterval(async () => {
            // Check for this instance being the reader node
            App.SCAN_CONTRACTS = Environment.env.hasOwnProperty('SCAN_CONTRACTS')
                ? Environment.env.SCAN_CONTRACTS
                : await this.isScanContracts();

            // tslint:disable-next-line:no-shadowed-variable
            const allContracts: BlockchainContract[] = await contractRepository.find({
                where: {
                    mode: Environment.env.MODE
                }
            });
            for (const ourContract of allContracts) {
                const tt: TokenTracker | undefined = TokenTracker._tokenTrackers.find((val: TokenTracker) => {
                    return val.code === ourContract.code;
                });
                if (tt) {
                    tt.run = ourContract.run_listener === 1;
                }
            }
        }, 5000);

        // Process our SQS message queue
        const { database, pusher } = this
        // Start up three more listeners
        this.listeners = (new Array(20)).fill(null).map(() => {
            const listener = new Listener(database, pusher)
            listener.start()
            return listener
        })

        // const dateString: string = '2021-10-12T15:00:00.000-04:00';
        // const dateString: string = '2021-10-19T17:00:00.000-04:00';
        // const dateString: string = '2021-10-27T11:00:00.000-04:00';
        // const snapShot = new Snapshot(this.database, allContracts[0], new Date(dateString));
        // snapShot.run();
        // const dateString: string = '2021-11-19T17:00:00.000-05:00';
        // const snapShot = new Snapshot(this.database, allContracts[0], new Date(dateString));
        // await snapShot.run();
    }

    /**
     * Determine whether or not we should be scanning our contract
     * @private
     */
    private async isScanContracts(): Promise<boolean> {
        // Determine whether or not we are to scan the contracts (we may have multiple servers running,
        // and only one scanner can run)
        let scanContracts: boolean = false;
        if (Environment.env.EC2_HOSTNAME) {
            const readerHostname = await Util.cachedKeyVal('SYSTEM_CONFIG', 'readerHostname', 100);
            if (readerHostname === Environment.env.EC2_HOSTNAME) {
                scanContracts = true;
            }
        }
        // return scanContracts;
        // Single machine mode TODO revisit this later
        return true;
    }

    /**
     * Generates the proper contract listener class for a given contract. Returns null if
     * we do not want to listen to this particular contract.
     * @param contract
     * @private
     */
    private contractListenerFactory(contract: BlockchainContract): ContractListener | null {
        let contractListener: ContractListener | null = null;
        // TODO Remove x from contract keys
        switch (contract.code) {
            case 'xOPENSEA_COMMON_1155_CB':
                contractListener = new ERC1155(contract.token_id, this.pusher);
                console.log('Listening to OPENSEA_COMMON_1155_CB');
                break;
            case 'COOLCAT_721': {
                const ownerRepository: Repository<CoolcatOwner> = this.database.connection.getRepository(CoolcatOwner);
                contractListener = new ERC721(this.pusher, ownerRepository);
                console.log('Listening to COOLCAT_721');
            }
                break;
            case 'COOLPET_721': {
                const ownerRepository: Repository<CoolcatOwner> = this.database.connection.getRepository(CoolcatOwner);
                contractListener = new ERC721(this.pusher, ownerRepository, async (tokenId: number, from: string, to: string) => {
                    await this.petManager.onPetTransferEvent(tokenId, from, to);
                });
                console.log('Listening to COOLPET_721');
            }
                break;
            case 'GOLD_CONTRACT':
                contractListener = new GoldContract(this.pusher);
                console.log('Listening to GOLD_CONTRACT');
                break;
            case 'ITEM_FACTORY':
                contractListener = new ItemFactoryContract(this.pusher);
                console.log('Listening to ITEM_FACTORY');
                break;
            case 'PET_INTERACTION':
                contractListener = new PetInteractionContract(this.pusher);
                console.log('Listening to PET_INTERACTION');
                break;
            case 'MARKETPLACE':
                contractListener = new MarketplaceContract(this.pusher);
                console.log('Listening to MARKETPLACE');
                break;
            case 'QUEST':
                contractListener = new QuestContract(this.pusher);
                console.log('Listening to QUEST');
                break;
            case 'ADVENTURERS_GUILD':
                contractListener = new AdventurersGuildContract(this.pusher);
                console.log('Listening to ADVENTURERS_GUILD');
                break;
            case 'TREASURY':
                contractListener = new TreasuryContract(this.pusher);
                console.log('Listening to TREASURY');
                break;
            case 'OPEN_PET_BOXES':
                contractListener = new OpenPetBoxes(this.pusher)
                console.log('Listening to OPEN_PET_BOXES');
                break;
            case 'MILK_ACTION':
                contractListener = new MilkAction(this.pusher)
                console.log('Listening to MILK_ACTION');
                break;
        }
        return contractListener;
    }

}

// Kick things off
console.log(`Starting coolcats-service`);
const ourApp: App = new App();
