/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetInteraction} from '../entity/pet-interaction';
import {getRepository} from 'typeorm';
import {User} from '../entity/user';
import {Coolpets} from '../entity/coolpets';
import {PetItem} from '../entity/pet-item';
import {EStage, PetManagerService} from '../services/pet-manager.service';
import {Config} from '../config';
import {Environment} from '../environment';
import {Util} from '../utility/util';
import type Web3 from 'web3'

export class PetInteractionContract extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    private web3: Web3;
    private petManager: PetManagerService;

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the PET_INTERACTION
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
                    try {
                        console.log(`Received pet interaction event: ${ourEvent.event}`);
                        switch (ourEvent.event) {
                            case 'LogPetInteractionEvent':
                                await this.logPetInteraction(ourEvent, blockTimestamp);
                                break;
                            case 'LogPetReachBlobOneEvent':
                                await this.logPetReachBlobOneEvent(ourEvent);
                                break;
                            case 'LogPetReachBlobTwoEvent':
                                await this.logPetReachBlobTwoEvent(ourEvent);
                                break;
                            case 'LogPetReachFinalFormEvent':
                                await this.logPetReachFinalFormEvent(ourEvent);
                                break;
                        }
                    } catch (err: any) {
                        console.log(`=============================================`);
                        console.log(`Pet interaction contract failed to process event ${ourEvent.event}`);
                        console.log(`=============================================`);
                        console.log(err);

                        // Send error off to newrelic
                        const message: string = err && err.message ? err.message : 'Unknown error parsing events in pet-interaction.contract.ts';
                        Util.noticeError(err, { message });
                    }
                }
            }
        }
    }

    /**
     * LogPetInteractionEvent(address from, uint256 petTokenId, uint256 itemTokenId)
     * @param event
     * @param blockTimestamp
     * @private
     */
    private async logPetInteraction(event: any, blockTimestamp: string): Promise<void> {

        // Find the user
        const userRepo = getRepository<User>(User);
        let user: User | undefined = await userRepo.findOne({
            where: {
                account: event.returnValues.from
            }
        });
        if (!user) {
            user = await Util.createUser(userRepo, event.returnValues.owner);
        }

        // Find the coolpet
        const coolpetRepo = getRepository<Coolpets>(Coolpets);
        const coolpet: Coolpets | undefined = await coolpetRepo.findOne({
            where: {
                token_id: event.returnValues.petTokenId
            }
        });
        if (!coolpet) {
            throw new Error(`LogPetInteractionEvent event for unknown pet ${event.returnValues.petTokenId}`);
        }

        // Find the item
        const itemRepo = getRepository<PetItem>(PetItem);
        const petItem: PetItem | undefined = await itemRepo.findOne({
            where: {
                item_id: event.returnValues.itemTokenId
            }
        });
        if (!petItem) {
            throw new Error(`LogPetInteractionEvent event for unknown item ${event.returnValues.itemTokenId}`);
        }

        // Create our pet interaction record
        const pi: PetInteraction = new PetInteraction();
        pi.timestamp = blockTimestamp;
        pi.user = user;
        pi.pet_item = petItem;
        pi.coolpet = coolpet;

        // Save the pet interaction record
        const petInteractionRepo = getRepository<PetInteraction>(PetInteraction);
        await petInteractionRepo.save<PetInteraction>(pi);

        // Update our pet record
        coolpet.air += petItem.air;
        coolpet.fire += petItem.fire;
        coolpet.water += petItem.water;
        coolpet.grass += petItem.grass;
        await coolpetRepo.save<Coolpets>(coolpet);

        // Update our metadata on public metadata site
        // ==> Uncomment this if we want interactions added to the public metadata <==
        // await this.petManager.addInteractionToPublicMetadata(parseInt(event.returnValues.petTokenId), petItem);

        const displayCurrentElement = (coolpet.stage.toLowerCase() === "two");
        const element = await this.calculatePetElement(coolpet);

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_INTERACTION_APPLIED, user.account);
        console.log(`Pet interaction successEvent: ${successEventToSend}`);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'PET_INTERACTION_APPLIED',
            account: user.account,
            coolpetTokenId: coolpet.token_id,
            itemTokenId: petItem.item_id,
            ...(displayCurrentElement) && { currentElement: element },
        }, 5, user.account);
    }

    /**
     * LogPetReachBlobOneEvent(address from, uint256 petTokenId)
     * @param event
     * @private
     */
    private async logPetReachBlobOneEvent(event: any): Promise<void> {
        await this.petManager.transformPet(parseInt(event.returnValues.petTokenId), EStage.BLOB1);

        await this.updateOpenSeaMetadata(parseInt(event.returnValues.petTokenId));

        const petRepository = getRepository<Coolpets>(Coolpets);
        const coolPet: Coolpets | undefined = await petRepository.findOne({
            where: {
                token_id: parseInt(event.returnValues.petTokenId)
            }
        });
        if (!coolPet) {
            throw new Error(`LogPetReachBlobOneEvent: Could not find Coolpet record for token Id: ${event.returnValues.petTokenId}. Failed to update stage`);
        }

        try {
            coolPet.stage = "one"

            await petRepository.save<Coolpets>(coolPet);
        } catch (error) {
            throw new Error(`LogPetReachBlobOneEvent: Could not update stage data for coolpet id ${event.returnValues.petTokenId}`);
        }

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_STAGE_REACHED, event.returnValues.from);
        console.log(`Moved to blob 1 form: ${successEventToSend}`);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'PET_STAGE_REACHED',
            account: event.returnValues.from,
            petTokenId: event.returnValues.petTokenId,
            stage: Config.PET_STAGE_PATHS.blob1.stageName
        }, 5, event.returnValues.from);
    }

    /**
     * LogPetReachBlobTwoEvent(address from, uint256 petTokenId)
     * @param event
     * @private
     */
    private async logPetReachBlobTwoEvent(event: any): Promise<void> {
        await this.petManager.transformPet(parseInt(event.returnValues.petTokenId), EStage.BLOB2);

        await this.updateOpenSeaMetadata(parseInt(event.returnValues.petTokenId));

        const petRepository = getRepository<Coolpets>(Coolpets);
        const coolPet: Coolpets | undefined = await petRepository.findOne({
            where: {
                token_id: parseInt(event.returnValues.petTokenId)
            }
        });
        if (!coolPet) {
            throw new Error(`LogPetReachBlobOneEvent: Could not find Coolpet record for token Id: ${event.returnValues.petTokenId}. Failed to update stage`);
        }

        try {
            coolPet.stage = "two"

            await petRepository.save<Coolpets>(coolPet);
        } catch (error) {
            throw new Error(`LogPetReachBlobOneEvent: Could not update stage data for coolpet id ${event.returnValues.petTokenId}`);
        }

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_STAGE_REACHED, event.returnValues.from);
        console.log(`Moved to blob 2 form: ${successEventToSend}`);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'PET_STAGE_REACHED',
            account: event.returnValues.from,
            petTokenId: event.returnValues.petTokenId,
            stage: Config.PET_STAGE_PATHS.blob2.stageName
        }, 5, event.returnValues.from);

    }

    /**
     * LogPetReachFinalFormEvent(address from, uint256 petTokenId)
     * @param event
     * @private
     */
    private async logPetReachFinalFormEvent(event: any): Promise<void> {

        await this.petManager.transformToFinalForm(parseInt(event.returnValues.petTokenId));

        await this.updateOpenSeaMetadata(parseInt(event.returnValues.petTokenId));

        const petRepository = getRepository<Coolpets>(Coolpets);
        const coolPet: Coolpets | undefined = await petRepository.findOne({
            where: {
                token_id: parseInt(event.returnValues.petTokenId)
            }
        });
        if (!coolPet) {
            throw new Error(`LogPetReachBlobOneEvent: Could not find Coolpet record for token Id: ${event.returnValues.petTokenId}. Failed to update stage`);
        }

        try {
            coolPet.stage = "final_form"

            await petRepository.save<Coolpets>(coolPet);
        } catch (error) {
            throw new Error(`LogPetReachBlobOneEvent: Could not update stage data for coolpet id ${event.returnValues.petTokenId}`);
        }

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_STAGE_REACHED, event.returnValues.from);
        console.log(`Moved to final form: ${successEventToSend}`);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'PET_STAGE_REACHED',
            account: event.returnValues.from,
            petTokenId: event.returnValues.petTokenId,
            stage: Config.PET_STAGE_PATHS.finalForm.stageName
        }, 5, event.returnValues.from);
    }

    /**
     * Notify OpenSea that they need to update the metadata and image of a particular asset
     * @param petTokenId
     * @private
     */
    private async updateOpenSeaMetadata(petTokenId: number) {
        const blockchainContractRepo = getRepository<BlockchainContract>(BlockchainContract);
        const petContract: BlockchainContract | undefined = await blockchainContractRepo.findOne({
           where: {
               code: 'COOLPET_721'
           }
        });
        if (petContract) {
            try {
                const url = `${Environment.env.OPENSEA_ENDPOINT}api/v1/asset/${petContract.address}/${petTokenId}/?force_update=true`;
                const options = {method: 'GET', headers: {'X-API-KEY': `${Environment.env.OPENSEA_API_KEY}`}};
                await fetch(url, options);
            } catch (error) {
                // We are going to eat this error, because it isn't catastrophic and is probably
                // a situation where opensea is down or something like that.
                console.log(`Could not refresh token id: ${petTokenId} at opensea`);
            }
        } else {
            throw new Error('Could not find blockchainContract record for COOLPET_721');
        }
    }

    async calculatePetElement(coolpet: Coolpets) {
        // Search for the key having the highest value, const elements will be an array of 1 or more
        // element name strings from the set ('fire', 'air', 'grass' or 'water) representing the element(s)
        // with the highest value.
        const stats: any = { fire: coolpet.fire, air: coolpet.air, grass: coolpet.grass, water: coolpet.water };
        const max: number = Math.max(stats.air, stats.fire, stats.grass, stats.water);
        const elements: string[] = Object.keys(stats).filter((key) => {
            return stats[key] === max;
        });

        // We couuld have a tie, so if so, I need to grab all of our interactions that were applied to this
        // pet and work our way backwards. When I find an interaction that has both max traits, I can choose
        // the one that
        let element: string | undefined;
        if (elements.length > 1) {
            // We have a tie. We need to grab all of our interactions that were applied to this
            // pet and work our way backwards. When I find the first interaction that has an element value
            // from the tied list that is greater than the others, that will be the element we
            // turn this pet into

            // Need to go grab all of the interactions from the database
            const petInteractionRepo = getRepository<PetInteraction>(PetInteraction);
            const interactions: PetInteraction[] | undefined = await petInteractionRepo.find({
                relations: ['user', 'coolpet', 'pet_item'],
                where: {
                    coolpet
                },
                order: {
                    id: 'DESC'
                }
            });
            if (!interactions) {
                throw new Error(`Could not find any interactions for pet id: ${coolpet.id}`);
            }

            // =========================================================================================================
            // Local function that will look at a PetInteraction and return the element name from the elements array
            // passed in as a parameter that has a value greater than any other element in the elements array
            // =========================================================================================================
            const maxElementFromPetInteraction: (petInteraction: PetInteraction, elements: string[]) => string | undefined = (petInteraction: PetInteraction) => {
                const petItem: PetItem = petInteraction.pet_item;
                let maxValue = 0;
                let maxElement: string | undefined;
                elements.forEach((val: string) => {
                    switch (val) {
                        case 'fire':
                            if (petItem.fire > maxValue) {
                                maxValue = petItem.fire;
                                maxElement = val;
                            }
                            break;
                        case 'air':
                            if (petItem.air > maxValue) {
                                maxValue = petItem.air;
                                maxElement = val;
                            }
                            break;
                        case 'grass':
                            if (petItem.grass > maxValue) {
                                maxValue = petItem.grass;
                                maxElement = val;
                            }
                            break;
                        case 'water':
                            if (petItem.water > maxValue) {
                                maxValue = petItem.water;
                                maxElement = val;
                            }
                            break;
                    }
                });
                return maxElement;
            }
            // =========================================================================================================
            // END OF LOCAL FUNCTION maxElementFromPetInteraction(...)
            // =========================================================================================================

            // Choose the element from the most recent pet interaction's element parameters. As currently
            // coded, if there are more than one element parameters in the pet item associated with the interaction
            // that are both in the elements array and have the same value in the pet item, the precident
            // for what will be chosen will be 'water', 'grass', 'air', 'fire' because of how the
            // const stats is created above (the order of the keys).
            //
            // We have to loop backwards through interactions until we find a non-zero value for one
            // of the elements that are tied.
            //
            for (let i = 0; i < interactions.length && (typeof element === 'undefined'); i++) {
                // Calling local function  above
                element = maxElementFromPetInteraction(interactions[i], elements);
            }

            return element;
        } else {
            return  elements[0];
        }
    }
}
