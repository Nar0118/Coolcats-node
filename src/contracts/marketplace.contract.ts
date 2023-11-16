/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {PetManagerService} from '../services/pet-manager.service';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {getManager, getRepository} from 'typeorm';
import {MarketplaceListing} from '../entity/marketplace-listing';
import {User} from '../entity/user';
import {Util} from '../utility/util';
import {PetItem} from '../entity/pet-item';
import type Web3 from 'web3'

// Enum identifying which type of transaction we are engaging in when
// we update a user's quantity of a particular token type
enum EMarketTransactionType {
    BUYER,
    SELLER
}

/*
* event LogNewListing(uint256 listingId, address seller, uint256 tokenId, uint256 amount, uint256 price, uint256 priceWithFee);
* event LogRemoveListing(uint256 listingId, address seller, bool isSale);
* event LogPurchase(uint256 listingId, address seller, address buyer);
*/

type TLogNewListing = {
    returnValues: {
        listingId: number;
        seller: string;
        tokenId: string;
        amount: string;
        price: string;
        priceWithFee: string;
    }
}

type TLogRemoveListing = {
    returnValues: {
        listingId: number;
        seller: string;
        isSale: boolean;
    }
}

type TLogPurchase = {
    returnValues: {
        listingId: number;
        seller: string;
        buyer: string;
    }
}


export class MarketplaceContract extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    private web3: Web3;
    private petManager: PetManagerService;

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the MARKETPLACE
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {
        this.petManager = petManager;
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
                    let account: string | undefined = undefined;
                    let type: EPusherEvent | undefined = undefined;
                    try {
                        switch (ourEvent.event) {
                            case 'LogNewListing':
                                account = ourEvent.returnValues.seller;
                                type = EPusherEvent.LISTING_CREATED;
                                await this.logNewListing(ourEvent, blockTimestamp);
                                break;
                            case 'LogRemoveListing':
                                account = ourEvent.returnValues.seller;
                                type = EPusherEvent.LISTING_REMOVED;
                                await this.logRemoveListing(ourEvent, blockTimestamp);
                                break;
                            case 'LogPurchase':
                                account = ourEvent.returnValues.buyer;
                                type = EPusherEvent.LISTING_BOUGHT;
                                await this.logPurchase(ourEvent);
                                break;
                            case 'LogSetFee':
                                await this.logSetFee(ourEvent);
                                break;
                            case 'LogBulkRemoveListings':
                                await this.logBulkRemoveListings(ourEvent);
                                break;
                        }
                    } catch (err: any) {
                        const message: string = (err && err.message) ? err.message : 'Unknown error parsing events in marketplace.contract.ts';
                        console.log(`=============================================`);
                        console.log(`Marketplace contract failed to process event ${ourEvent.event}`);
                        console.log(`Error Message: ${message}`);
                        console.log(`=============================================`);
                        console.log(err);

                        Util.noticeError(err, { message });

                        // Send out a pusher error message if we have a user account to send it to
                        if (account) {
                            const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, account);
                            await Util.sendPusherMessage(this.pusherService, successEventToSend, {
                                type,
                                account,
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
     * LogNewListing(listingId: uint256, seller: address, tokenId: uint256, amount: uint256, price: uint256)
     *
     * @param ourEvent
     * @param blockTimestamp
     * @constructor
     * @private
     */
    private async logNewListing(ourEvent: TLogNewListing, blockTimestamp: string): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            // Find the user record for the seller
            let user: User | undefined = await transactionalEntityManager.findOne<User>(User, {
                where: {
                    account: ourEvent.returnValues.seller
                }
            });
            if (!user) {
                const userRepository = transactionalEntityManager.getRepository<User>(User);
                user = await Util.createUser(userRepository, ourEvent.returnValues.seller);
            }

            // Grab the petItem to reference the listing to
            const petItem: PetItem | undefined = await getRepository<PetItem>(PetItem).findOne({
                where: {
                    item_id: ourEvent.returnValues.tokenId
                }
            });
            if (!petItem) {
                throw new Error(`Event Handler: logNewListing - Could not find item id: ${ourEvent.returnValues.tokenId}`);
            }

            let listing: MarketplaceListing | undefined = await transactionalEntityManager.findOne<MarketplaceListing>(MarketplaceListing, {
                where: {
                    listingId: ourEvent.returnValues.listingId
                }
            });
            if (!listing) {
                // Create the listing record
                listing = new MarketplaceListing();
                listing.listingId = ourEvent.returnValues.listingId;
            }

            listing.create_timestamp = new Date(blockTimestamp);
            listing.tokenId = parseInt(ourEvent.returnValues.tokenId);
            listing.amount = parseInt(ourEvent.returnValues.amount);
            // TODO: are we sure we want this as an int?
            listing.price = +this.web3.utils.fromWei(ourEvent.returnValues.price, 'ether');
            listing.user = user;
            listing.pet_item = petItem;

            await transactionalEntityManager.save<MarketplaceListing>(listing);
        });

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.LISTING_CREATED, ourEvent.returnValues.seller);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'LISTING_CREATED',
            account: ourEvent.returnValues.seller,
            listingId: ourEvent.returnValues.listingId,
            tokenId: ourEvent.returnValues.tokenId,
            amount: ourEvent.returnValues.amount,
            price: ourEvent.returnValues.price,
        }, 5);
    }

    /**
     * event LogRemoveListing(uint256 listingId, address seller, bool isSale);
     *
     * @param ourEvent
     * @private
     */
    private async logRemoveListing(ourEvent: TLogRemoveListing, blockTimestamp: string): Promise<void> {

        let tokenId: number = 0;
        let amount: number = 0;
        let price: number = 0;
        await getManager().transaction(async transactionalEntityManager => {
            const listing: MarketplaceListing | undefined = await transactionalEntityManager.findOne<MarketplaceListing>(MarketplaceListing, {
                relations: ['user'],
                where: {
                    listingId: ourEvent.returnValues.listingId
                }
            });
            if (!listing) {
                throw new Error(`LogRemoveListing failed due to non-existent listing id: ${ourEvent.returnValues.listingId}`);
            }

            tokenId = listing.tokenId;
            amount = listing.amount;
            price = listing.price;

            // Record the removal of the listing
            listing.remove_timestamp = new Date(blockTimestamp);
            await transactionalEntityManager.save<MarketplaceListing>(listing);
        });

        const isSale: boolean = ourEvent.returnValues.isSale;

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.LISTING_REMOVED, ourEvent.returnValues.seller);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'LISTING_REMOVED',
            account: ourEvent.returnValues.seller,
            listingId: ourEvent.returnValues.listingId,
            tokenId,
            amount,
            price,
            isSale
        }, 5);
    }

    /**
     * LogPurchase(listingId: uint256, seller: address, buyer: address)
     * @param ourEvent
     * @private
     */
    private async logPurchase(ourEvent: TLogPurchase): Promise<void> {
        let tokenId: number = 0;
        let amount: number = 0;
        let price: number = 0;

        // We use a transaction so it is all or none in the database
        await getManager().transaction(async transactionalEntityManager => {
            const listing: MarketplaceListing | undefined = await transactionalEntityManager.findOne<MarketplaceListing>(MarketplaceListing, {
                relations: ['user'],
                where: {
                    listingId: ourEvent.returnValues.listingId
                }
            });
            if (!listing) {
                throw new Error(`LogPurchase failed due to non-existent listing id: ${ourEvent.returnValues.listingId}`);
            }

            tokenId = listing.tokenId;
            amount = listing.amount;
            price = listing.price;

            // Record the buyer of this item
            listing.buyer = ourEvent.returnValues.buyer;
            await transactionalEntityManager.save<MarketplaceListing>(listing);
        });

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.LISTING_BOUGHT, ourEvent.returnValues.buyer);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'LISTING_BOUGHT',
            account: ourEvent.returnValues.seller,
            listingId: ourEvent.returnValues.listingId,
            buyer: ourEvent.returnValues.buyer,
            amount,
            price,
            tokenId
        }, 5);
    }

    /**
     * LogSetFee(feeBp, uint256)
     * @param ourEvent
     * @private
     */
    private async logSetFee(ourEvent: any): Promise<void> {

    }

    /**
     * LogBulkRemoveListings(uint256[] listingIds)
     * @param ourEvent
     * @private
     */
    private async logBulkRemoveListings(ourEvent: any): Promise<void> {

    }
}
