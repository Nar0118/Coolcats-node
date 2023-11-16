/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import { Environment } from '../environment';
import { SecretsManager } from 'aws-sdk';
import { Connection, createConnection } from 'typeorm';
import { ConnectionOptions } from 'typeorm/connection/ConnectionOptions';
import { GoldTransaction } from '../entity/gold-transaction';
import { Nonce } from '../entity/nonce';
import { BlockchainContract } from '../entity/blockchain-contract';
import { User } from '../entity/user';
import { UserProperty } from '../entity/user-property';
import { CoolcatOwner } from '../entity/coolcat-owner';
import { Coolcats } from '../entity/coolcats';
import { TokenTransfer } from '../entity/token-transfer';
import { CatGoldAward } from '../entity/cat-gold-award';
import { PetCategory } from '../entity/pet-category';
import { PetItem } from '../entity/pet-item';
import { PetType } from '../entity/pet-type';
import { Coolpets } from "../entity/coolpets";
import { KeyValue } from '../entity/key-value';
import { PetUserItem } from "../entity/pet-user-item";
import { PetInteraction } from '../entity/pet-interaction';
import { MarketplaceListing } from '../entity/marketplace-listing';
import { QuestSelection } from '../entity/quest-selection';
import { QuestHistory } from '../entity/quest-history';
import { QuestIo } from '../entity/quest-io';
import { QuestTheme } from '../entity/quest-theme';
import { AdventureGoldAward } from '../entity/adventure-gold-award';
import { StakedPet } from '../entity/staked-pet';
import { AllowListUser } from '../entity/allow-list-user';
import { Whitelist } from '../entity/whitelist';
import { Action } from '../entity/action';
import { ActionHistory } from '../entity/action-history';

// tslint:disable-next-line:no-var-requires
const AWS = require('aws-sdk');

export class DatabaseService {

    private dbCredentials: {
        username: string,
        password: string,
        engine: string,
        host: string,
        port: number,
        dbname: string,
        dbClusterIdentifier: string
    };
    public connection: Connection;

    constructor(private onConnect?: () => void, private syncDatabase?: boolean) {
        if (Environment.env.DB_CREDENTIALS) {
            const x = Environment.env.DB_CREDENTIALS;
            this.dbCredentials = JSON.parse(Environment.env.DB_CREDENTIALS);
            this.init(undefined, syncDatabase);
        } else {
            const client: SecretsManager = new AWS.SecretsManager({
                region: Environment.env.AWS_REGION
            });
            const params: SecretsManager.Types.GetSecretValueRequest = {
                SecretId: Environment.env.AWS_DATABASE_SECRET_NAME
            }
            client.getSecretValue(params, (err, result) => {
                if (err) {
                    if (err.code === 'DecryptionFailureException')
                        // Secrets Manager can't decrypt the protected secret text using the provided KMS key.
                        // Deal with the exception here, and/or rethrow at your discretion.
                        throw err;
                    else if (err.code === 'InternalServiceErrorException')
                        // An error occurred on the server side.
                        // Deal with the exception here, and/or rethrow at your discretion.
                        throw err;
                    else if (err.code === 'InvalidParameterException')
                        // You provided an invalid value for a parameter.
                        // Deal with the exception here, and/or rethrow at your discretion.
                        throw err;
                    else if (err.code === 'InvalidRequestException')
                        // You provided a parameter value that is not valid for the current state of the resource.
                        // Deal with the exception here, and/or rethrow at your discretion.
                        throw err;
                    else if (err.code === 'ResourceNotFoundException')
                        // We can't find the resource that you asked for.
                        // Deal with the exception here, and/or rethrow at your discretion.
                        throw err;
                } else {
                    // Decrypts secret using the associated KMS CMK.
                    // Depending on whether the secret is a string or binary, one of these fields will be populated.
                    if ('SecretString' in result) {
                        this.dbCredentials = JSON.parse(result.SecretString as string);
                        this.init();
                    } else {
                        throw (new Error('Missing SecretString'));
                    }
                }
            });
        }
    }

    /**
     * Method connects to the database
     * @private
     */
    public async init(callback?: () => void, syncDatabase?: boolean): Promise<void> {
        const synchronize: boolean = typeof syncDatabase !== 'undefined' ? syncDatabase : false;
        const options: ConnectionOptions = {
            type: 'mysql',
            host: this.dbCredentials.host,
            port: this.dbCredentials.port,
            username: this.dbCredentials.username,
            password: this.dbCredentials.password,
            database: this.dbCredentials.dbname,
            synchronize,
            entities: [Coolcats, Coolpets, BlockchainContract, CoolcatOwner, TokenTransfer, GoldTransaction, CatGoldAward, Nonce, User, UserProperty, PetCategory, PetItem, PetType, PetUserItem, KeyValue, PetInteraction, MarketplaceListing, QuestHistory, QuestIo, QuestSelection, QuestTheme, AdventureGoldAward, StakedPet, AllowListUser, Whitelist, Action, ActionHistory]
        }
        try {
            this.connection = await createConnection(options);
            if (callback) {
                callback();
            } else {
                if (this.onConnect) {
                    this.onConnect();
                }
            }
        } catch (err) {
            console.log(err);
            throw err
        }
    }
    disconnect() {
        return this.connection?.close()
    }
}
