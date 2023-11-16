/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Environment} from '../environment';
import {DatabaseService} from '../services/database.service';
import {Repository} from 'typeorm/repository/Repository';
import {BlockchainContract} from '../entity/blockchain-contract';
import {getRepository} from 'typeorm';
import {CoolcatOwner} from '../entity/coolcat-owner';
import {IPetItemInteraction, Util} from '../utility/util';
import {Coolpets} from '../entity/coolpets';
import {EStage, PetManagerService} from '../services/pet-manager.service';
import {Config} from '../config';
import {PetItem} from "../entity/pet-item";

const tokenId = 2709;

export const main = async () => {
    Environment.merge();
    let database: DatabaseService = new DatabaseService(async () => {

        // Create a pet manager service object
        const petManager: PetManagerService = new PetManagerService(database);

        // Database successfully connected
        // Grab our blockchain contract record for the Coolpet contract
        const blockchainContractRepository: Repository<BlockchainContract> = getRepository<BlockchainContract>(BlockchainContract);
        const blockchainContract: BlockchainContract | undefined = await blockchainContractRepository.findOne({where: {
                code: 'COOLPET_721',
                mode: Environment.env.MODE
            }});

        if (blockchainContract) {
            // Grab the pet owner record from the database
            const coolcatOwnerRepo = getRepository<CoolcatOwner>(CoolcatOwner);
            const ownerFromDb: CoolcatOwner | undefined = await coolcatOwnerRepo.findOne({
                where: {
                    token_id: tokenId,
                    blockchainContract
                }
            });

            // Grab and/or set up some things from the blockchain
            const petStageString: any = await Util.getPetStage(tokenId);
            const petStage: EStage = parseInt(petStageString);
            const owner: string = await Util.getPetOwner(tokenId);
            const interactions = await Util.getPetInteractions(tokenId);
            let stateKey: string | undefined;
            switch (petStage) {
                case EStage.EGG:
                    stateKey = 'egg';
                    break;
                case EStage.BLOB1:
                    stateKey = 'blob1';
                    break;
                case EStage.BLOB2:
                    stateKey = 'blob2';
                    break;
                case EStage.FINAL_FORM:
                    stateKey = 'finalForm';
            }

            // Make sure the owner record is correct.
            if (!ownerFromDb) {
                // We do not have an owner record so we need to add one
                // Get the token owner
                const cco: CoolcatOwner = new CoolcatOwner();
                cco.timestamp = Util.mysqlFromDate(new Date());
                cco.trx_hash = 'created-by-fix-pet';
                cco.block_number = 0;
                cco.token_id = tokenId;
                cco.from = Util.BLACK_HOLE;
                cco.to = owner;
                cco.value = "0";
                cco.eth = 0;
                cco.blockchainContract = blockchainContract
                await coolcatOwnerRepo.save<CoolcatOwner>(cco);
            } else {
                // We do have a DB record, so we are going to simply force the owner to be correct
                ownerFromDb.to = owner;
                await coolcatOwnerRepo.save<CoolcatOwner>(ownerFromDb);
            }

            // See if we have a coolpet record
            const coolPetRepo = getRepository<Coolpets>(Coolpets);
            let coolpetRecord: Coolpets | undefined = await coolPetRepo.findOne({ where: {
                    token_id: tokenId
                }});
            if (!coolpetRecord) {
                // We do not have a cool pet record so create one
                coolpetRecord = new Coolpets();
                coolpetRecord.token_id = tokenId;
            }

            // Synthesize our metadata
            let element = '';
            const [air, fire, grass, water] = await getElementalAffinities(interactions);

            // TODO: Calculate elemental affinities from interactions (Create util function).
            coolpetRecord.air = air;
            coolpetRecord.fire = fire;
            coolpetRecord.grass = grass;
            coolpetRecord.water = water;

            coolpetRecord.stage = Config.PET_STAGE_PATHS[stateKey as string].stageName.toLowerCase();

            try {
                // TODO: If pet is final form, calculate it's element
                // TODO: Move metadata about
                if (petStage !== EStage.FINAL_FORM) {
                    const metadata = await petManager.transformPet(tokenId, petStage, false);

                    coolpetRecord.name = metadata.name;
                    coolpetRecord.description = metadata.description;
                    coolpetRecord.image = metadata.image;
                    metadata.attributes.forEach((val: {trait_type: string, value: string}) => {
                        switch (val.trait_type) {
                            case 'element':
                                (coolpetRecord as Coolpets).element = val.value;
                                break;
                            case 'hat':
                                (coolpetRecord as Coolpets).hat = val.value;
                                break;
                            case 'face':
                                (coolpetRecord as Coolpets).face = val.value;
                                break;
                            case 'chest':
                                (coolpetRecord as Coolpets).chest = val.value;
                                break;
                            case 'arm':
                                (coolpetRecord as Coolpets).arm = val.value;
                                break;
                            case 'body':
                                (coolpetRecord as Coolpets).body = val.value;
                                break;
                            case 'back':
                                (coolpetRecord as Coolpets).back = val.value;
                                break;
                        }
                    });

                    await coolPetRepo.save<Coolpets>(coolpetRecord);
                } else {
                    coolpetRecord.image = `https://${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}/${Config.PET_IMAGE_PATH}${tokenId.toString()}.png`;

                    await coolPetRepo.save<Coolpets>(coolpetRecord);

                    await petManager.transformToFinalForm(tokenId, false);
                }

                console.log(`Successfully fixed Cool Pets data for PET ID: ${tokenId}`);
            } catch (error) {
                console.log(`Failed to fix metadata of Cool Pet with id ${tokenId}`);
                console.log(error);
            }
        }
    });
}

const getElementalAffinities = async (interactions: IPetItemInteraction[]) => {
    let [air, fire, grass, water] = [0, 0, 0, 0];
    for (let i = 0; i < interactions.length; i++) {
        const interaction: IPetItemInteraction = interactions[i];

        const petItem: PetItem | undefined = await getRepository<PetItem>(PetItem).findOne({
            where: {
                item_id: interaction.itemTokenId
            }
        });
        if (!petItem) {
            throw new Error(`Could not find interaction pet item with id ${interaction.itemTokenId}`);
        }

        air += petItem.air;
        fire += petItem.fire;
        grass += petItem.grass;
        water += petItem.water;
    }

    return [air, fire, grass, water];
}

export default main;
