/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */
import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {TokenTransfer} from '../entity/token-transfer';
import {BigNumber} from 'bignumber.js';
import {GoldTransaction} from '../entity/gold-transaction';
import {EntityManager, getManager, getRepository} from 'typeorm';
import {Util} from '../utility/util';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetCategory} from '../entity/pet-category';
import {PetType} from '../entity/pet-type';
import {PetItem} from '../entity/pet-item';
import {User} from "../entity/user";
import {PetUserItem} from "../entity/pet-user-item";
import {PetManagerService} from '../services/pet-manager.service';
import {IElementData} from '../reset-pets';
import {Environment} from '../environment';
import type Web3 from 'web3'

/**
 * This class tracks items in the Cool Cats item factory contract on the polygon network
 * The handled events are:
 *
 *     event LogNewItem(bytes32 itemKey, bytes32 categoryKey, bytes32 typeKey, uint256 tokenId);
 *     event LogRemoveItem(bytes32 key);
 *
 *     event LogNewType(bytes32 categoryKey, bytes32 typeKey);
 *     event LogRemoveType(bytes32 categoryKey, bytes32 typeKey);
 *
 *     event LogNewCategory(bytes32 categoryKey);
 *     event LogRemoveCategory(bytes32 categoryKey);
 *
 *     event LogMintItem(address owner, uint256 tokenId, uint256 amount);
 *     event LogBurnItem(address owner, uint256 tokenId, uint256 amount);
 *
 *     event LogBuyBox(address buyer, uint256 quantity);
 *     event LogOpenBox(address buyer);
 */
export class ItemFactoryContract extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    private web3: Web3;

    // Holds our queue of items that need to be minted
    private mintItemQueue: Array<any> = new Array<any>();

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the ITEM_FACTORY
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

                    // Handle the events
                    try {
                        switch (ourEvent.event) {
                            case 'LogNewItem':
                                await this.logNewItem(ourEvent);
                                break;
                            case 'LogRemoveItem':
                                await this.logRemoveItem(ourEvent);
                                break;
                            case 'LogNewType':
                                await this.logNewType(ourEvent);
                                break;
                            case 'LogRemoveType':
                                await this.logRemoveType(ourEvent);
                                break;
                            case 'LogNewCategory':
                                await this.logNewCategory(ourEvent);
                                break;
                            case 'LogRemoveCategory':
                                await this.logRemoveCategory(ourEvent);
                                break;
                            case 'LogMintItem':
                                // Now handled by the erc1155TransferEvent or erc1155TransferBatchEvent methods
                                // await this.logMintItem(ourEvent);
                                break;
                            case 'LogBurnItem':
                                // Now handled by the erc1155TransferEvent or erc1155TransferBatchEvent methods
                                // await this.logBurnItem(ourEvent);
                                break;
                            case 'LogBuyBox':
                                await this.logBuyBox(ourEvent);
                                break;
                            case 'LogOpenBox':
                                await this.logOpenBox(ourEvent);
                                break;
                            case 'TransferSingle':
                                await this.erc1155TransferEvent(ourEvent);
                                break;
                            case 'TransferBatch':
                                await this.erc1155TransferBatchEvent(ourEvent);
                                break;
                        }
                    } catch (err: any) {
                        console.log(`=============================================`);
                        console.log(`Item factory contract failed to process event ${ourEvent.event}`);
                        console.log(`=============================================`);
                        console.log(err);

                        const message: string = (err && err.message) ? err.message : 'Unknown error parsing events in item-factory.contract.ts';
                        Util.noticeError(err, { message });
                    }
                }
            }
        }
    }

    /**
     * Records a batch of transfers event which occur when an item is listed (transfer to system address)
     * or removed (back to original holder if just removed, or to new holder if bought).
     *
     * @param event
     * @private
     */
    private async erc1155TransferBatchEvent(event: any): Promise<void> {
        // Grab from and to values
        const from: string = event.returnValues.from;
        const to: string = event.returnValues.to;

        const ids: any[] = event.returnValues.ids;
        const values: any[] = event.returnValues.values;

        // Transfer a batch of tokens
        for (let i: number = 0; i < ids.length; i++) {
            event.returnValues.id = ids[i];
            event.returnValues.value = values[i];
            await this.erc1155TransferEvent(event);
        }
    }

    /**
     * Records a transfer event which occur when an item is listed (transfer to system address)
     * or removed (back to original holder if just removed, or to new holder if bought)
     * @param event
     * @private
     */
    private async erc1155TransferEvent(event: any): Promise<void> {

        // Grab the quantity that we are transferring
        const quantity: number = (typeof event.returnValues.value === 'string') ? parseInt(event.returnValues.value) : event.returnValues.value;
        const tokenId: number = (typeof event.returnValues.id === 'string') ? parseInt(event.returnValues.id) : event.returnValues.id;

        // Grab from and to values
        const from: string = event.returnValues.from;
        const to: string = event.returnValues.to;

        if (from === Util.BLACK_HOLE) {
            // We are minting new item(s) for the to account
            try {
                await this.createOrUpdatePetUserItem(to, tokenId, quantity);

                // // Send out our pusher message
                // const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_ITEM_TRANSFER, to);
                // await Util.sendPusherMessage(this.pusherService, eventToSend, {
                //     type: 'PET_ITEM_TRANSFER',
                //     account: to,
                //     tokenId
                // }, 5);

                return;
            } catch (err: any) {
                // TODO Notify operator of this failure
                const message: string = err && err.message ? err.message : 'Unknown Error Message';
                Util.noticeError(err, { message });
                console.log(`==============================================`);
                console.log(`TRANSFER FAILED From: ${from} to ${to} quantity: ${quantity} Item: ${tokenId}`);
                console.log(`==============================================`);
            }
        }

        if (to === Util.BLACK_HOLE) {
            // We are burning new item(s) for the from account
            try {
                await this.createOrUpdatePetUserItem(from, tokenId, -1 * quantity);

                // // Send out our pusher message
                // const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_ITEM_TRANSFER, from);
                // await Util.sendPusherMessage(this.pusherService, eventToSend, {
                //     type: 'PET_ITEM_TRANSFER',
                //     account: from,
                //     tokenId
                // }, 5);

                return;
            } catch (err: any) {
                // TODO Notify operator of this failure
                const message: string = err && err.message ? err.message : 'Unknown Error Message';
                Util.noticeError(err, { message });
                console.log(`==============================================`);
                console.log(`TRANSFER FAILED From: ${from} to ${to} quantity: ${quantity} Item: ${tokenId}`);
                console.log(`==============================================`);
            }
        }

        if (from !== Util.BLACK_HOLE && to !== Util.BLACK_HOLE) {
            // We are transferring token from one user to another
            try {
                await this.transferPetUserItem(from, to, tokenId, quantity);

                // NOT CURRENTLY IN USE BY THE FRONTEND
                // // Send out our pusher message
                // let eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_ITEM_TRANSFER, from);
                // await Util.sendPusherMessage(this.pusherService, eventToSend, {
                //     type: 'PET_ITEM_TRANSFER',
                //     from: from,
                //     to: to,
                //     tokenId
                // }, 5);
                //
                // // Send out our pusher message
                // eventToSend = this.pusherService.eventWithAddress(EPusherEvent.PET_ITEM_TRANSFER, to);
                // await Util.sendPusherMessage(this.pusherService, eventToSend, {
                //     type: 'PET_ITEM_TRANSFER',
                //     account: to,
                //     tokenId
                // }, 5);

                return;
            } catch (err: any) {
                // TODO Notify operator of this failure
                const message: string = err && err.message ? err.message : 'Unknown Error Message';
                Util.noticeError(err, { message });
                console.log(`==============================================`);
                console.log(`TRANSFER FAILED From: ${from} to ${to} quantity: ${quantity} Item: ${tokenId}`);
                console.log(`==============================================`);
            }
        }
    }

    /**
     * @param event - LogNewItem(bytes32 categoryKey, bytes32 typeKey, uint256 itemId)
     * @private
     */
    private async logNewItem(event: any): Promise<void> {
        const typeRepo = getRepository<PetType>(PetType);
        const itemRepo = getRepository<PetItem>(PetItem);
        const type: PetType | undefined = await typeRepo.findOne({ where: {
            type_key: event.returnValues.typeKey
            }});
        if (type) {
            const itemElemString: string | undefined = await Util.getValue('PET_ITEM', `name-${ event.returnValues.itemId }`);
            if (!itemElemString) {
                throw new Error(`LogNewItem event could not find name for item_id: ${event.returnValues.tokenId}`);
            }
            try {
                const itemElem: IElementData = JSON.parse(itemElemString);
                const item: PetItem = new PetItem();
                item.name = Environment.env.MODE === 'prod' ? itemElem['Prod Item Name'] : itemElem['Beta Item Name'];
                item.item_id = parseInt(event.returnValues.itemId);
                item.pet_type = type;
                item.grass = itemElem.Grass;
                item.water = itemElem.Water;
                item.fire = itemElem.Fire;
                item.air = itemElem.Air;
                await itemRepo.save<PetItem>(item);
            } catch (error) {
                throw new Error(`LogNewItem event on unknown typeKey ${event.returnValues.typeKey}`);
            }
        } else {
            throw new Error(`LogNewItem event could not be created in database for item_id: ${event.returnValues.tokenId}`);
        }
    }

    /**
     * @param event - LogRemoveItem(bytes32 key)
     * @private
     */
    private async logRemoveItem(event: any): Promise<void> {
        const itemRepo = getRepository<PetItem>(PetItem);
        const item: PetItem | undefined = await itemRepo.findOne({ where: {
                token_id: event.returnValues.key
            }});
        if (item) {
            await itemRepo.remove(item);
        } else {
            throw new Error(`LogRemoveItem event on unknown itemKey ${event.returnValues.key}`);
        }
    }

    /**
     * @param event - LogNewType(bytes32 categoryKey, bytes32 typeKey)
     * @private
     */
    private async logNewType(event: any): Promise<void> {
        const categoryRepo = getRepository<PetCategory>(PetCategory);
        const typeRepo = getRepository<PetType>(PetType);
        const category: PetCategory | undefined = await categoryRepo.findOne({ where: {
                category_key: event.returnValues.categoryKey
            }});
        if (category) {
            const type: PetType = new PetType();
            type.type_key = event.returnValues.typeKey;
            type.name = this.web3.utils.hexToUtf8(event.returnValues.typeKey);
            type.pet_category = category;
            await typeRepo.save<PetType>(type);
        } else {
            throw new Error(`LogNewType event on unknown categoryKey ${event.returnValues.categoryKey}`);
        }
    }

    /**
     * @param event - LogRemoveType(bytes32 categoryKey, bytes32 typeKey)
     * @private
     */
    private async logRemoveType(event: any): Promise<void> {
        const typeRepo = getRepository<PetType>(PetType);
        const type: PetType | undefined = await typeRepo.findOne({ where: {
                type_key: event.returnValues.typeKey
            }});
        if (type) {
            await typeRepo.remove(type);
        } else {
            throw new Error(`LogRemoveType event on unknown categoryKey ${event.returnValues.categoryKey}`);
        }
    }

    /**
     * @param event - LogNewCategory(bytes32 categoryKey)
     * @private
     */
    private async logNewCategory(event: any): Promise<void> {
        const categoryRepo = getRepository<PetCategory>(PetCategory);
        const newCategory: PetCategory = new PetCategory();
        newCategory.category_key = event.returnValues.categoryKey;
        newCategory.name = this.web3.utils.hexToUtf8(event.returnValues.categoryKey);
        await categoryRepo.save<PetCategory>(newCategory);
    }

    /**
     * @param event - LogRemoveCategory(bytes32 categoryKey)
     * @private
     */
    private async logRemoveCategory(event: any): Promise<void> {
        const categoryRepo = getRepository<PetCategory>(PetCategory);
        const category: PetCategory | undefined = await categoryRepo.findOne({ where: {
                category_key: event.returnValues.categoryKey
            }});
        if (category) {
            await categoryRepo.remove(category);
        } else {
            throw new Error(`LogRemoveCategory event on unknown categoryKey ${event.returnValues.categoryKey}`);
        }
    }

    /**
     * @param event - LogMintItem(address owner, uint256 tokenId, uint256 amount)
     * @private
     */
    private async logMintItem(event: any): Promise<void> {

        // Fix types if we need to
        if (typeof event.returnValues.amount === 'string') {
            event.returnValues.amount = parseInt(event.returnValues.amount);
        }
        if (typeof event.returnValues.tokenId === 'string') {
            event.returnValues.tokenId = parseInt(event.returnValues.tokenId);
        }

        // Needs to all be done in a transaction because while an async individual
        // SQL call is outstanding, another mint may come in and interfere with
        // the success of the first.
        await getManager().transaction(async transactionalEntityManager => {
            let user: User | undefined = await transactionalEntityManager.findOne<User>(User,{
                where: {
                    account: event.returnValues.owner
                }});
            if (!user) {
                const userRepo: any = transactionalEntityManager.getRepository<User>(User);
                user = await Util.createUser(userRepo, event.returnValues.owner);
            }

            const petItem: PetItem | undefined = await transactionalEntityManager.findOne<PetItem>(PetItem,{ where: {
                    item_id: event.returnValues.tokenId
                }});
            if (!petItem) {
                throw new Error(`LogMintItem event for unknown item_id ${event.returnValues.tokenId}`);
            }

            // This facilitates the ability to retry the transaction for up to 5 seconds if we find
            // someone else has the PetUserItem table locked.
            try {
                let petUserItem: PetUserItem | undefined;
                petUserItem = await transactionalEntityManager.findOne<PetUserItem>(PetUserItem, {
                    where: {
                        user,
                        pet_item: petItem
                    }
                });
                if (!petUserItem) {
                    petUserItem = new PetUserItem();
                    petUserItem.quantity = 0;
                    petUserItem.user = user;
                    petUserItem.pet_item = petItem;
                }
                petUserItem.quantity += event.returnValues.amount;
                console.log(`Attempting on petItem: ${petItem.item_id} on user ${user.account}`);
                await transactionalEntityManager.save<PetUserItem>(petUserItem);
                console.log(`Succeeded on petItem: ${petItem.item_id} on user ${user.account}`);

            } catch (error) {
                console.log(error);
            }
        });
    }

    /**
     * Method to createOrUpdate a PetUserItem while being passed in a transactionEntityManager so we execute
     * within a transaction.
     *
     * @param transactionalEntityManager
     * @param account
     * @param tokenId
     * @param amount
     * @private
     */
    private async _createOrUpdatePetUserItem(transactionalEntityManager: EntityManager, account: string, tokenId: number, amount: number): Promise<void> {
        let user: User | undefined = await transactionalEntityManager.findOne<User>(User,{
            where: {
                account
            }});
        if (!user) {
            const userRepo: any = transactionalEntityManager.getRepository<User>(User);
            user = await Util.createUser(userRepo, account);
        }

        // We need to grab the PetItem
        const petItem: PetItem | undefined = await transactionalEntityManager.findOne<PetItem>(PetItem,{ where: {
                item_id: tokenId
            }});
        if (!petItem) {
            throw new Error(`mintItem cannot find item_id: ${tokenId}`);
        }

        // Create or update the PetUserItem
        let petUserItem: PetUserItem | undefined;
        petUserItem = await transactionalEntityManager.findOne<PetUserItem>(PetUserItem, {
            where: {
                user,
                pet_item: petItem
            }
        });
        if (!petUserItem) {
            petUserItem = new PetUserItem();
            petUserItem.quantity = 0;
            petUserItem.user = user;
            petUserItem.pet_item = petItem;
        }
        petUserItem.quantity += amount;
        if (petUserItem.quantity < 0) {
            throw new Error(`Insufficient balance to decrement PetUserItem for user: ${account} item_id: ${tokenId} amount: ${amount}`);
        }

        console.log(`SUCCESSFUL ITEM TRANSFER user: ${account} item_id: ${tokenId} amount: ${amount}`);

        // Create or update the PetUserItem record
        await transactionalEntityManager.save<PetUserItem>(petUserItem);
    }

    /**
     * Method creates (or updates) a PetUserItem record with the amount of tokens specified
     * @param account
     * @param tokenId
     * @param amount
     * @private
     */
    private async createOrUpdatePetUserItem(account: string, tokenId: number, amount: number): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            await this._createOrUpdatePetUserItem(transactionalEntityManager, account, tokenId, amount);
        });
    }

    /**
     * Transfers a quantity of items from one user to another user
     * @param from
     * @param to
     * @param tokenId
     * @param amount
     * @private
     */
    private async transferPetUserItem(from: string, to: string, tokenId: number, amount: number): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            await this._createOrUpdatePetUserItem(transactionalEntityManager, from, tokenId, -1 * amount);
            await this._createOrUpdatePetUserItem(transactionalEntityManager, to, tokenId, amount);
        });
    }

    /**
     * Function to create or update a PetUserItem record
     * @param transactionalEntityManager
     * @param user
     * @param petItem
     * @param amount
     * @private
     */
    private savePetUserItem(transactionalEntityManager: EntityManager, user: User, petItem: PetItem, amount: number): Promise<void> {
        let retryCount: number = 20;
        return new Promise<void>(async (resolve, reject) => {
            try {

                // Either update an existing pet user item record or create a new one.
                let petUserItem: PetUserItem | undefined;
                petUserItem = await transactionalEntityManager.findOne<PetUserItem>(PetUserItem, {
                    where: {
                        user,
                        pet_item: petItem
                    }
                });
                if (!petUserItem) {
                    petUserItem = new PetUserItem();
                    petUserItem.quantity = 0;
                    petUserItem.user = user;
                    petUserItem.pet_item = petItem;
                }
                petUserItem.quantity += amount;
                console.log(`Attempting on petItem: ${petItem.item_id} on user ${user.account}`);
                await transactionalEntityManager.save<PetUserItem>(petUserItem);
                console.log(`Succeeded on petItem: ${petItem.item_id} on user ${user.account}`);
                resolve();

            } catch (err) {
                retryCount--;
                if (retryCount > 0) {
                    setTimeout(() => {
                        // Try again
                        console.log(`Retrying petItem: ${petItem.item_id} on user ${user.account}`);
                        this.savePetUserItem(transactionalEntityManager, user, petItem, amount);
                    }, 2500);
                } else {
                    reject('Database deadlock on PetUserItem creation.');
                }
            }
        });
    }

    /**
     * @param event - LogBurnItem(address owner, uint256 tokenId, uint256 amount)
     * @private
     */
    private async logBurnItem(event: any): Promise<void> {

        // Fix types if we need to
        if (typeof event.returnValues.amount === 'string') {
            event.returnValues.amount = parseInt(event.returnValues.amount);
        }
        if (typeof event.returnValues.tokenId === 'string') {
            event.returnValues.tokenId = parseInt(event.returnValues.tokenId);
        }

        const userRepo = getRepository<User>(User);
        const petUserItemRepo = getRepository<PetUserItem>(PetUserItem);
        const itemRepo = getRepository<PetItem>(PetItem);

        let user: User | undefined = await userRepo.findOne({ where: {
                account: event.returnValues.owner
            }});
        if (!user) {
            user = await Util.createUser(userRepo, event.returnValues.owner);
        }

        const petItem: PetItem | undefined = await itemRepo.findOne({ where: {
                item_id: event.returnValues.tokenId
            }});
        if (!petItem) {
            throw new Error(`LogBurnItem event for unknown item_id ${event.returnValues.tokenId}`);
        }

        const petUserItem: PetUserItem | undefined = await petUserItemRepo.findOne({ where: {
                user,
                pet_item: petItem
            }});
        if (!petUserItem) {
            throw new Error(`LogBurnItem event for unknown user: ${event.returnValues.owner} item: ${event.returnValues.tokenId}`);
        } else {
            if (petUserItem.quantity > petUserItem.quantity) {
                throw new Error(`LogBurnItem event attempted to burn ${event.returnValues.amount} ${event.returnValues.tokenId} tokens when user ${event.returnValues.owner} has only ${petUserItem.quantity} `);
            } else {
                petUserItem.quantity -= event.returnValues.amount;
                await petUserItemRepo.save<PetUserItem>(petUserItem);
            }
        }
    }

    /**
     * @param event - LogBuyBox(address buyer, uint256 quantity)
     * @private
     */
    // tslint:disable-next-line:no-empty
    private async logBuyBox(event: any): Promise<void> {
        // Notify the client that some number of buy boxes were minted
        // They will be added to the PetUserItem table because the LogMintItem
        // is also sent for the box item.
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BUY_BOX_MINTED, event.returnValues.buyer);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'BUY_BOX_MINTED',
            account: event.returnValues.buyer,
            quantity: event.returnValues.quantity
        }, 5, event.returnValues.buyer);
    }

    /**
     * @param event - LogOpenBox(address buyer, uint256[] itemIds)
     * @private
     */
    // tslint:disable-next-line:no-empty
    private async logOpenBox(event: any): Promise<void> {
        // Notify the client that a box has been opened.
        // The item quantity will be updated on the PetUserItem table because the LogBurnItem
        // is also sent for the box item.
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BOX_OPENED, event.returnValues.buyer);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'BUY_BOX_OPENED',
            account: event.returnValues.buyer,
            itemIds: event.returnValues.itemIds
        }, 5, event.returnValues.buyer);
    }

}
