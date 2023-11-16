/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Environment} from './environment';
import {DatabaseService} from './services/database.service';
import {getConnection, getRepository} from 'typeorm';
import {CatGoldAward} from './entity/cat-gold-award';
import {Connection} from 'typeorm/connection/Connection';
import {GoldTransaction} from './entity/gold-transaction';
import {Nonce} from './entity/nonce';
import {PetItem} from './entity/pet-item';
import {PetType} from './entity/pet-type';
import {PetCategory} from './entity/pet-category';
import {UserProperty} from './entity/user-property';
import {User} from './entity/user';
import {Coolpets} from './entity/coolpets';
import {TokenTransfer} from './entity/token-transfer';
import {CoolcatOwner} from './entity/coolcat-owner';
import {AWSError} from 'aws-sdk/lib/error';
import {ListObjectsOutput} from 'aws-sdk/clients/s3';
import {KeyValue} from './entity/key-value';
import {PetUserItem} from './entity/pet-user-item';
import {BlockchainContract} from './entity/blockchain-contract';
import {MarketplaceListing} from './entity/marketplace-listing';
import {PetInteraction} from './entity/pet-interaction';
import {QuestHistory} from './entity/quest-history';
import {QuestSelection} from './entity/quest-selection';
import {QuestTheme} from './entity/quest-theme';
import {QuestIo} from './entity/quest-io';
import {AdventureGoldAward} from './entity/adventure-gold-award';
import {StakedPet} from './entity/staked-pet';
import {LoadKey} from './utility/loadKey';

const prompt = require('prompt-sync')({ sigint: true });
const AWS = require('aws-sdk');
const fs = require('fs');

// Matches the format of the JSON received from DEVs that defines elements
export interface IElementData {
    "TokenId": number;
    "Prod Item Name": string;
    "Beta Item Name": string;
    "Fire": number;
    "Air": number;
    "Grass": number;
    "Water": number;
    "Mood": string;
}

// Matches the format of the JSON received from DEVs that defines quests
export interface IQuestData {
    "ID": number;
    "Title": string;
    "iconUrl": string;
    "Quest Giver": string;
    "Description": string;
    "Minor Success": string;
    "Major Success": string;
}

export class ResetPets {
    
    private database: DatabaseService;
    
    constructor() {
    
        console.log(`+---------------------+`);
        console.log(`| Starting reset-pets |`);
        console.log(`+---------------------+`);
        
        setTimeout(async () => {
            await this.run();
        }, 100);
    }
    
    /**
     * Script to reset the PETs database
     * @private
     */
    private async run(): Promise<void> {
        
        let mode: string | undefined = process.env.MODE;
        while (!mode) {
            mode = prompt('Choose envornment (prod, sand, beta): ');
            mode = (mode as string).toLocaleLowerCase();
            if ((mode !== 'prod') && (mode !== 'sand') && (mode !== 'beta')) {
                mode = undefined;
            }
        }
        
        // Only confirm if MODE was not set as an environment var
        if (!process.env.MODE) {
            const confirm: string = prompt(`Please confirm chosen mode: ${mode} [y/n]: `);
            if (confirm.toLowerCase() !== 'y') {
                process.exit();
            }
        }

        // Merge in our process env vars
        Environment.merge(mode);
    
        // We do not have to load our system account keys because this class does
        // not make authenticated blockchain calls - uncomment this line if we need
        // to make an authenticated blockchain call.
        // await LoadKey.loadKeyFromAwsSecrets();
    
        // Connect to the cool cats database at AWS
        this.database = new DatabaseService(this.onConnect.bind(this));
    }
    
    /**
     * Called after we have a database connection
     *
     * DELETE FROM CatGoldAward;
     * DELETE FROM GoldTransaction;
     * DELETE FROM Coolpets;
     * DELETE FROM Nonce;
     * DELETE FROM PetItem;
     * DELETE FROM PetType;
     * DELETE FROM PetCategory;
     * DELETE FROM UserProperty;
     * DELETE FROM User;
     * DELETE FROM TokenTransfer WHERE blockchainContractId = <id of coolpets blockchainContract>;
     * DELETE FROM CoolcatOwner WHERE blockchainContractId = <id of coolpets blockchainContract>;
     *
     * @private
     */
    private async onConnect(): Promise<void> {
    
        // Make sure our tables are in sync with our entities (use migrations when we go to production)
        // this.database.connection.synchronize(false);
    
        try {
            let removePets: boolean = true;
            if (!process.env.MODE) {
                // Prompt as to whether or not we are to remove the cool pets
                const confirm: string = prompt(`Remove Cool Pets? [y/n]: `);
                removePets = (confirm.toLowerCase() === 'y');
            }
    
            const conn: Connection = getConnection();
            console.log(`Connected to database ${Environment.env.DB_CREDENTIALS.host}`);
    
            console.log(`Deleting PET_ITEM namespace from KeyValue content`);
            await conn.createQueryBuilder().delete().from(KeyValue).where(`namespace = :ns`, {ns: 'PET_ITEM'}).execute();
    
            await this.recreatePetItemNamespace(conn, 'scripts/beta-item-elements.json');
        
            console.log(`Deleting QUEST_THEME namespace from KeyValue content`);
            await conn.createQueryBuilder().delete().from(KeyValue).where(`namespace = :ns`, {ns: 'QUEST_THEME'}).execute();
            
            await this.recreateQuestIdNamespace(conn, 'scripts/beta-quests-data.json');
    
            console.log(`Deleting CatGoldAward content`);
            await conn.createQueryBuilder().delete().from(CatGoldAward).execute();
    
            console.log(`Deleting AdventureGoldAward content`);
            await conn.createQueryBuilder().delete().from(AdventureGoldAward).execute();
    
            console.log(`Deleting StakedPet content`);
            await conn.createQueryBuilder().delete().from(StakedPet).execute();
    
            console.log(`Deleting GoldTransaction content`);
            await conn.createQueryBuilder().delete().from(GoldTransaction).execute();
    
            console.log(`Deleting Nonce content`);
            await conn.createQueryBuilder().delete().from(Nonce).execute();
    
            console.log(`Deleting PetUserItem content`);
            await conn.createQueryBuilder().delete().from(PetUserItem).execute();
    
            console.log(`Deleting MarketplaceListing content`);
            await conn.createQueryBuilder().delete().from(MarketplaceListing).execute();
    
            console.log(`Deleting QuestHistory content`);
            await conn.createQueryBuilder().delete().from(QuestHistory).execute();
    
            console.log(`Deleting QuestSelection content`);
            await conn.createQueryBuilder().delete().from(QuestSelection).execute();
    
            console.log(`Deleting QuestTheme content`);
            await conn.createQueryBuilder().delete().from(QuestTheme).execute();
    
            console.log(`Deleting QuestIo content`);
            await conn.createQueryBuilder().delete().from(QuestIo).execute();
    
            console.log(`Deleting PetInteraction content`);
            await conn.createQueryBuilder().delete().from(PetInteraction).execute();
    
            console.log(`Deleting PetItem content`);
            await conn.createQueryBuilder().delete().from(PetItem).execute();
    
            console.log(`Deleting PetType content`);
            await conn.createQueryBuilder().delete().from(PetType).execute();
    
            console.log(`Deleting PetCategory content`);
            await conn.createQueryBuilder().delete().from(PetCategory).execute();
    
            console.log(`Deleting UserProperty content`);
            await conn.createQueryBuilder().delete().from(UserProperty).execute();
    
            console.log(`Deleting User content`);
            await conn.createQueryBuilder().delete().from(User).execute();
    
            if (removePets) {
                await this.removePets(conn);
            }
        } catch (error) {
            console.log(error);
        }
        
        process.exit();
    }
    
    /**
     * Removes all of the pet data (including public metadata server content)
     * @param conn
     * @private
     */
    private async removePets(conn: Connection): Promise<void> {
        const coolpetsContract: BlockchainContract | undefined = await getRepository<BlockchainContract>(BlockchainContract).findOne({
            where: {
                code: 'COOLPET_721',
                mode: Environment.env.MODE
            }
        });
        if (coolpetsContract) {
            // Clean up the database
            console.log(`Deleting TokenTransfer for PET contract id: ${coolpetsContract.id}`);
            await conn.createQueryBuilder().delete().from(TokenTransfer).where(`blockchainContractId = :id`, { id: coolpetsContract.id }).execute();
            console.log(`Deleting CoolcatOwner for PET contract id: ${coolpetsContract.id}`);
            await conn.createQueryBuilder().delete().from(CoolcatOwner).where(`blockchainContractId = :id`, { id: coolpetsContract.id }).execute();
            console.log(`Deleting Coolpets content`);
            await conn.createQueryBuilder().delete().from(Coolpets).execute();
    
            /*
            // Create our s3 SDK reference
            const s3 = new AWS.S3();
    
            // Grab the object keys of all of the data we are to delete from the main public metadata server
            const s3Images: string[] = await this.listS3Files(s3, Config.PET_IMAGE_PATH);
            const s3Jsons: string[] = await this.listS3Files(s3, Config.PET_METADATA_PATH);
            
            // Delete the images
            for (let i = 0; i < s3Images.length; i++) {
                const objectKey: string = s3Images[i];
                await new Promise<DeleteObjectOutput>((resolve, reject) => {
                    var params = {
                        Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                        Key: objectKey
                    };
                    s3.deleteObject(params, (err: AWSError, data: DeleteObjectOutput) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                });
                console.log(`Removed ${objectKey} from s3 bucket ${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}`);
            }
    
            // Delete the jsons
            for (let i = 0; i < s3Jsons.length; i++) {
                const objectKey: string = s3Jsons[i];
                await new Promise<DeleteObjectOutput>((resolve, reject) => {
                    var params = {
                        Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                        Key: objectKey
                    };
                    s3.deleteObject(params, (err: AWSError, data: DeleteObjectOutput) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                });
                console.log(`Removed ${objectKey} from s3 bucket ${Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET}`);
            }
            */
        }
    }
    
    /**
     * Lists all files found in an S3 bucket with specific path prefix
     * @param s3
     * @param path
     * @private
     */
    private async listS3Files(s3: any, path: string): Promise<string[]> {
        let marker: string | undefined = undefined;
        const s3ObjectKeys: string[] = new Array<string>();
        while (true) {
            const listObjectOutput: ListObjectsOutput = await new Promise<ListObjectsOutput>((resolve, reject) => {
                let params: any;
                if (marker) {
                    params = {
                        Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                        Delimiter: '',
                        Prefix: path,
                        Marker: marker
                    };
                } else {
                    params = {
                        Bucket: Environment.env.AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET,
                        Delimiter: '',
                        Prefix: path
                    };
                }
                s3.listObjects(params, (err: AWSError, data: ListObjectsOutput) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            });
            if (listObjectOutput && listObjectOutput.Contents && listObjectOutput.Contents.length > 0) {
                listObjectOutput.Contents.forEach((data: any) => {
                   s3ObjectKeys.push(data.Key);
                });
                marker = listObjectOutput.Contents[listObjectOutput.Contents.length - 1].Key;
            } else {
                break;
            }
        }
        
        return s3ObjectKeys;
    }
    
    /**
     * Recreates our PET_ITEM namespace in the KeyValue table
     * @param conn
     * @param jsonFile
     * @private
     */
    private async recreatePetItemNamespace(conn: Connection, jsonFile: string): Promise<void> {
        const kvRepo = getRepository<KeyValue>(KeyValue);
        const json: IElementData[] = this.readJsonFile(jsonFile);
        for (let i = 0; i < json.length; i++) {
            const elem: IElementData = json[i];
            const kv: KeyValue = new KeyValue();
            kv.namespace = 'PET_ITEM';
            kv.key = `name-${elem.TokenId}`;
            kv.value = JSON.stringify(elem);
            await kvRepo.save(kv);
        }
    }
    
    /**
     * Recreates our QUEST_THEME namespace in the KeyValue table
     * @param conn
     * @param jsonFile
     * @private
     */
    private async recreateQuestIdNamespace(conn: Connection, jsonFile: string): Promise<void> {
        const kvRepo = getRepository<KeyValue>(KeyValue);
        const json: IQuestData[] = this.readJsonFile(jsonFile);
        for (let i = 0; i < json.length; i++) {
            const elem: IQuestData = json[i];
            const kv: KeyValue = new KeyValue();
            kv.namespace = 'QUEST_THEME';
            kv.key = `theme-${elem.ID}`;
            kv.value = JSON.stringify(elem);
            await kvRepo.save(kv);
        }
    }
    
    /**
     * Reads data from a file and converts to a JSON
     * @param path
     * @private
     */
    private readJsonFile(path: string): any {
        const data: string = fs.readFileSync(path);
        return JSON.parse(data);
    }
    
}

// Kick things off
const ourApp: ResetPets = new ResetPets();
