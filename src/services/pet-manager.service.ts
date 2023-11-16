/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {DatabaseService} from './database.service';
import {Environment} from '../environment';
import {AWSError, S3} from 'aws-sdk';
import {CopyObjectOutput, GetObjectOutput, PutObjectOutput} from 'aws-sdk/clients/s3';
import {Config} from '../config';
import {Repository} from "typeorm/repository/Repository";
import {Coolpets} from "../entity/coolpets";
import {PetItem} from '../entity/pet-item';
import {getRepository} from 'typeorm';
import {PetInteraction} from '../entity/pet-interaction';
import {Util} from '../utility/util';

// tslint:disable-next-line:no-var-requires
const AWS = require('aws-sdk');

// tslint:disable-next-line:no-var-requires
const tmp = require('tmp');

// tslint:disable-next-line:no-var-requires
const fs = require('fs')

/**
 * STAGES OF A PET
 */
export enum EStage {
    EGG,
    BLOB1,
    BLOB2,
    FINAL_FORM
}

export class PetManagerService {

    private s3: S3;

    constructor(private databaseService: DatabaseService) {
        this.s3 = new AWS.S3();
    }

    /**
     * Called when a pet transfers from one address to another. If the "from" of the transfer
     * is the BLACK_HOLE, it means we are minting a new pet.
     * @param tokenId
     * @param from
     * @param to
     */
    public async onPetTransferEvent(tokenId: number, from: string, to: string): Promise<void> {

        // If we are minting, we need to move the metadata and image from our private
        // bucket over to our public api server. This is done via transferPet method.
        if (from === Util.BLACK_HOLE) {
            try {
                // Move the token's image and metadata to the public S3 bucket
                const petMetadata: any = await this.transformPet(tokenId, EStage.EGG);

                // Create our database record for the newly formed egg
                const coolpetsRepository: Repository<Coolpets> = this.databaseService.connection.getRepository(Coolpets);
                let coolpetRecord: Coolpets | undefined = await coolpetsRepository.findOne({
                    where: {
                        token_id: tokenId
                    }
                });
                if (!coolpetRecord) {
                    coolpetRecord = new Coolpets();
                    coolpetRecord.token_id = tokenId;
                }
                coolpetRecord.name = petMetadata.name;
                coolpetRecord.description = petMetadata.description;
                coolpetRecord.image = petMetadata.image;
                petMetadata.attributes.forEach((val: {trait_type: string, value: string}) => {
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

                coolpetRecord.stage = 'egg';

                // Save our Coolpets record for this minted token
                await coolpetsRepository.save(coolpetRecord);

                console.log(`Successfully created coolpets record for PET ID: ${tokenId}`);
            } catch (err) {
                console.log(`Unable to move image / metadata for MINT of PET ID: ${tokenId}`);
                console.log(err);
            }
        }
    }

    /**
     * Copies the appropriate image and metadata JSON to the public S3 metadata webserver
     * @param petTokenId
     * @param stage
     */
    public async transformPet(petTokenId: number, stage: EStage, checkPublicMetadata = true): Promise<any> {

        let stateKey: string | undefined;
        switch (stage) {
            case EStage.EGG:
                stateKey = 'egg';
                break;
            case EStage.BLOB1:
                stateKey = 'blob1';
                break;
            case EStage.BLOB2:
                stateKey = 'blob2';
                break;
        }

        // Perform all tasks
        try {
            // Function to copy the PET image to S3 for a given token ID.
            await new Promise<any>((resolve, reject) => {
                const imageParams = {
                    Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                    CopySource: `/${Environment.env.AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET}/${Config.PET_STAGE_PATHS[stateKey as string].image}`,
                    Key: `${Config.PET_IMAGE_PATH}${petTokenId.toString()}.png`
                };
                this.s3.copyObject(imageParams, (err: AWSError, response: CopyObjectOutput) => {
                    if (!err) {
                        resolve(response);
                    }  else {
                        reject(err);
                    }
                });
            });

            // Invalidate the cloudfront cache
            Util.invalidateCloudfront([`/${Config.PET_IMAGE_PATH}${petTokenId.toString()}.png`]);

            let petMetadata: any;
            if (stateKey !== 'egg' && checkPublicMetadata) {
                // Copy our existing metadata over from the public metadata web site. It
                // has been modified with additional attributes when each item was applied
                // to the pet.
                petMetadata = await this.readPublicPetMetadata(petTokenId);
            } else {
                // No existing metadata, so just create the petMetadata object with a single
                // entry in the attributes property that will get overridden when the fields
                // are updated below.
                petMetadata = {
                   "attributes": [
                        { }
                    ]
                };
            }

            // Update the metadata fields
            petMetadata.name = `Cool Pet #${petTokenId.toString()}`;
            petMetadata.description = Config.PET_STAGE_PATHS[stateKey as string].description;
            petMetadata.attributes[0] = {
                "trait_type": "Stage",
                "value": Config.PET_STAGE_PATHS[stateKey as string].stageName
            };
            petMetadata.image = `https://${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}/${Config.PET_IMAGE_PATH}${petTokenId.toString()}.png`;

            // Copy metadata to public metadata server for a given token ID
            await this.writePublicPetMetadata(petTokenId, petMetadata);

            // Needed when called by transformPet (not final form)
            return petMetadata;

        } catch (err) {
            console.log(`------- Failed processing metadata for token: ${petTokenId} stage ${stage}`);
            throw err;
        }

    }

    /**
     * Updates pet public metadata by adding the interaction to it.
     * @param petTokenId
     * @param petItem
     */
    public async addInteractionToPublicMetadata(petTokenId: number, petItem: PetItem): Promise<void> {

        const petMetadata: any = await this.readPublicPetMetadata(petTokenId);

        // interactionNumber starts at 1 because the attributes array has an initial
        // trait_type of 'element': 'egg' in it when the metadata is copied from private bucket
        // on initial mint.
        const interactionNumber: number = petMetadata.attributes.length;

        // Append the interaction
        petMetadata.attributes.push({
            trait_type: `Interaction ${interactionNumber}`,
            value: petItem.name
        });

        // Update the metadata on the public metadata server
        try {
            await this.writePublicPetMetadata(petTokenId, petMetadata);
        } catch (err) {
            console.log(err);
        }
    }

    /**
     * Moves a pet to its final form
     * @param petTokenId
     * @private
     */
    public async transformToFinalForm(petTokenId: number, checkPublicMetadata = true): Promise<void> {

        // First step, grab the pet
        const coolPetRepo = getRepository<Coolpets>(Coolpets);
        const coolpet: Coolpets | undefined = await coolPetRepo.findOne({
            where: {
                token_id: petTokenId
            }
        });
        if (!coolpet) {
            throw new Error(`transformToFinalForm failed to find pet with token id of ${petTokenId}`);
        }

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
                let maxValue: number = 0;
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
                const interaction: PetInteraction = interactions[i];

                // Calling local function  above
                element = maxElementFromPetInteraction(interactions[i], elements);
            }
            if (!element) {
                throw new Error(`Unexpected undefined selected element type for coolpet id: ${coolpet.id} [${interactions.length} interactions, ${elements.length} tied element types]`);
            }
        } else {
            element = elements[0];
        }

        // At this point, whave the element we are going to turn into (held as a string 'fire', 'water', 'grass' or 'air')
        // in the element variable.

        let petMetadata: any;
        if (checkPublicMetadata) {
            // Grab our current JSON for the given pet from the public web server S3 bucket
            petMetadata = await this.readPublicPetMetadata(petTokenId);
        } else {
            petMetadata = {
                "attributes": [
                    { }
                ]
            };
        }

        // Calculate boost percentage values for OpenSea
        const totalVal: number = (Object.values(stats).reduce((a, b) => { return (a as number) + (b as number); }) as number);
        Object.keys(stats).forEach((val: string) => {
            const attribute: any = {
                display_type: 'boost_percentage',
                value: Math.round(100 * (stats[val] / totalVal)),
                trait_type: `${val.charAt(0).toUpperCase()}${val.slice(1)}`
            };
            petMetadata.attributes.push(attribute);
        });

        // Get final form metadata from private bucket
        const ffMetadata: any = await this.readPrivateFinalFormMetadata(petTokenId, element);

        // Update the metadata fields
        petMetadata.name = coolpet.name = ffMetadata.name;
        petMetadata.description = coolpet.description = ffMetadata.description;
        petMetadata.attributes[0] = {
            "trait_type": "Stage",
            "value": Config.PET_STAGE_PATHS['finalForm'].stageName
        };

        // Update traits (in metadata as well as coolpet database record.
        ffMetadata.attributes.forEach((val: any) => {
           petMetadata.attributes.push(val);
           switch (val.trait_type) {
               case 'Element':
                   coolpet.element = val.value;
                   break;
               case 'Hat':
                   coolpet.hat = val.value;
                   break;
               case 'Face':
                   coolpet.face = val.value;
                   break;
               case 'Chest':
                   coolpet.chest = val.value;
                   break;
               case 'Arms':
                   coolpet.arm = val.value;
                   break;
               case 'Body':
                   coolpet.body = val.value;
                   break;
               case 'Back':
                   coolpet.back = val.value;
                   break;
           }
        });

        // ---------------------------------------
        // This is where we start to update things
        // ---------------------------------------

        // Save our updated coolpet record
        await coolPetRepo.save<Coolpets>(coolpet);

        // Move our private final form pet image to public server
        const paths: any = await this.writePublicPetImage(petTokenId, element);
        petMetadata.image = paths.image;
        petMetadata.thumbnail = paths.thumbnail;

        // Save our updated metadata to public server
        await this.writePublicPetMetadata(petTokenId, petMetadata);
    }

    // ==============
    // Helper methods
    // ==============

    /**
     * Updates the metadata on the public server with that specified for a given token ID
     * @param petTokenId
     * @param petMetadata
     * @private
     */
    private async writePublicPetMetadata(petTokenId: number, petMetadata: any): Promise<void> {
        await new Promise<any>((resolve, reject) => {
            const metadataParams = {
                Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                Key: `${Config.PET_METADATA_PATH}${petTokenId.toString()}`,
                Body: JSON.stringify(petMetadata),
                ContentType: "application/json"
            };
            this.s3.putObject(metadataParams, (err: AWSError, response: PutObjectOutput) => {
                if (!err) {
                    resolve(response);
                }  else {
                    reject(err);
                }
            });
        });
        Util.invalidateCloudfront([`/${Config.PET_METADATA_PATH}${petTokenId.toString()}`]);
    }

    /**
     * Moves the image (.png) for a given token ID and element type to the public metadata server
     * @param petTokenId
     * @param elementType
     * @private
     */
    private async writePublicPetImage(petTokenId: number, elementType: string): Promise<any> {

        const imagePath: string = `${elementType}/`;
        const tokenOffset: number = this.tokenOffsetFromElementType(elementType);
        const filePrefix: string = `${ (tokenOffset + petTokenId).toString() }`;

        const imageParams = {
            Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
            CopySource: `/${Environment.env.AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET}/${imagePath}${filePrefix}.png`,
            Key: `${Config.PET_IMAGE_PATH}${petTokenId.toString()}.png`
        };

        // Function to copy the PET image to S3 for a given token ID.
        const s3CopyPetImage = await new Promise<any>((resolve, reject) => {
            this.s3.copyObject(imageParams, (err: AWSError, response: CopyObjectOutput) => {
                if (!err) {
                    resolve(response);
                }  else {
                    reject(err);
                }
            });
        });

        // Copy thumbnail over if we are on PROD
        if (Environment.env.MODE === 'prod') {
            const thumbnailPath: string = `${elementType}-thumbnail/`;
            const thumbnailParams = {
                Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                CopySource: `/${Environment.env.AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET}/${thumbnailPath}${filePrefix}.png`,
                Key: `${Config.PET_THUMBNAIL_PATH}${petTokenId.toString()}.png`
            };

            // Function to copy the PET image to thumbnail for a given token ID.
            const s3CopyPetThumbnail = await new Promise<any>((resolve, reject) => {
                this.s3.copyObject(thumbnailParams, (err: AWSError, response: CopyObjectOutput) => {
                    if (!err) {
                        resolve(response);
                    }  else {
                        reject(err);
                    }
                });
            });
        }

        Util.invalidateCloudfront([`/${Config.PET_IMAGE_PATH}${petTokenId.toString()}.png`]);
        if (Environment.env.MODE === 'prod') {
            Util.invalidateCloudfront([`/${Config.PET_THUMBNAIL_PATH}${petTokenId.toString()}.png`]);
        }

        const imageFullPath: string = `https://${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}/${imageParams.Key}`;
        const thumbnailFullPath: string = (Environment.env.MODE === 'prod') ? `https://${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}/${Config.PET_THUMBNAIL_PATH}${petTokenId.toString()}.png` : '';
        return { image: imageFullPath, thumbnail: thumbnailFullPath };
    }

    /**
     * Returns the private metadata for a given pet id and element type
     * @param petTokenId
     * @param elementType
     * @private
     */
    private async readPrivateFinalFormMetadata(petTokenId: number, elementType: string): Promise<any> {
        // Read existing metadata from private bucket for the given token ID and element type
        const path: string = `${elementType}-metadata/`;
        const tokenOffset: number = this.tokenOffsetFromElementType(elementType);
        const filePrefix: string = `${ (tokenOffset + petTokenId).toString() }`;
        const privateMetadataString = await new Promise<GetObjectOutput>((resolve, reject) => {
            const metadataParams = {
                Bucket: Environment.env.AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET,
                Key: `${path}${filePrefix}.json`
            };
            this.s3.getObject(metadataParams, (err: AWSError, response: GetObjectOutput) => {
                if (!err) {
                    resolve(response);
                }  else {
                    reject(err);
                }
            });
        });
        const buff: Buffer = privateMetadataString.Body as Buffer;
        const privateMetadata: any = JSON.parse(buff.toString());

        // Make sure final form metadata fits our interface
        let isOk: boolean = false;
        try {
            isOk = privateMetadata.hasOwnProperty('name') && typeof privateMetadata.name === 'string'
                && privateMetadata.hasOwnProperty('description') && typeof privateMetadata.description === 'string'
                && privateMetadata.hasOwnProperty('attributes');
            if (isOk) {
                privateMetadata.attributes.forEach((val: any) => {
                    isOk = isOk && val.hasOwnProperty('trait_type') && typeof val.trait_type === 'string';
                    isOk = isOk && val.hasOwnProperty('value') && typeof val.value === 'string';
                });
            }
        } catch (error) { }
        if (!isOk) {
            throw new Error(`Private metadata for pet ID: ${petTokenId} type ${elementType} is not in the correct format`);
        }

        return privateMetadata;
    }

    /**
     * Private method to retrieve the existing metadata for a given petTokenId
     * @param petTokenId
     * @private
     */
    public async readPublicPetMetadata(petTokenId: number): Promise<any> {
        // Read existing metadata from public bucket for the given token ID
        const s3StageMetadata = await new Promise<GetObjectOutput>((resolve, reject) => {
            const metadataParams = {
                Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                Key: `${Config.PET_METADATA_PATH}${petTokenId}`
            };
            this.s3.getObject(metadataParams, (err: AWSError, response: GetObjectOutput) => {
                if (!err) {
                    resolve(response);
                }  else {
                    reject(err);
                }
            });
        });
        const buff: Buffer = s3StageMetadata.Body as Buffer;
        const petMetadata: any = JSON.parse(buff.toString());

        return petMetadata;
    }

    public async publicMetadataExists(petTokenId: number): Promise<boolean> {
        return await this.s3
            .headObject({
                Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                Key: `${Config.PET_METADATA_PATH}${petTokenId}`,
            })
            .promise()
            .then(
                () => true,
                err => {
                    if (err.code === 'NotFound') {
                        return false;
                    }
                    throw err;
                }
            );
    }

    /**
     * Returns the token offset for a given element type
     * @param elementType
     * @private
     */
    private tokenOffsetFromElementType(elementType: string): number {
        let tokenOffset: number = 0;

        // In the prod environment, the token offset is zero, other environments a set in the switch statement
        if (Environment.env.MODE !== 'prod') {
            switch (elementType) {
                case 'air':
                    tokenOffset = Config.PET_TOKEN_OFFSETS.air;
                    break;
                case 'water':
                    tokenOffset = Config.PET_TOKEN_OFFSETS.water;
                    break;
                case 'grass':
                    tokenOffset = Config.PET_TOKEN_OFFSETS.grass;
                    break;
                case 'fire':
                    tokenOffset = Config.PET_TOKEN_OFFSETS.fire;
                    break;
            }
        }
        return tokenOffset;
    }
}
