/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {SecretsManager} from 'aws-sdk';
import {Environment} from '../environment';
import * as AWS from 'aws-sdk'
import PUSHER from 'pusher'

Environment.merge()
// // tslint:disable-next-line:no-var-requires
// const PUSHER = require('pusher');

export enum EPusherEvent {
    BUY_BOX_TRANSACTION_SENT = 'buy-box-transaction-sent',
    BUY_ACTION_TRANSACTION_SENT = 'buy-action-transaction-sent',
    ACTION_BOUGHT = 'action-bought',
    BUY_BOX_MINTED = 'buy-box-minted',
    BOX_OPENED_TRANSACTION_SENT = 'box-opened-transaction-sent',
    BOX_OPENED = 'box-opened',
    OPEN_PET_BOXES_SENT = 'open-pet-boxes-sent',
    OPEN_PET_BOXES = 'open-pet-boxes',
    GOLD_CLAIM_TRANSACTION_SENT = 'gold-claim-transaction-sent',
    GOLD_CLAIMED = 'gold-claimed',
    USER_CONNECTED = 'user-connected',
    USER_DISCONNECTED = 'user-disconnected',
    BLOCKCHAIN_ERROR = 'blockchain-error',
    DATABASE_ERROR = 'database-error',
    PET_INTERACTION_TRANSACTION_SENT = 'pet-interaction-transaction-sent',
    PET_INTERACTION_APPLIED = 'pet-interaction-applied',
    PET_ITEM_TRANSFER = 'pet-item-transfer',
    PET_STAGE_REACHED = 'pet-stage-reached',
    CREATE_LISTING_TRANSACTION_SENT = 'create-listing-transaction-sent',
    LISTING_CREATED = 'listing-created',
    REMOVE_LISTING_TRANSACTION_SENT = 'remove-listing-transaction-sent',
    LISTING_REMOVED = 'listing-removed',
    BUY_LISTING_TRANSACTION_SENT = 'buy-listing-transaction-sent',
    LISTING_BOUGHT = 'listing-bought',
    ROLL_USER_QUEST_TRANSACTION_SENT = 'roll-user-quest-transaction-sent',
    QUEST_ROLLED = 'quest-rolled',
    COMPLETE_QUEST_TRANSACTION_SENT = 'complete-quest-transaction-sent',
    QUEST_COMPLETED = 'quest-completed',
    STAKE_PET_TRANSACTION_SENT = 'stake-pet-transaction-sent',
    STAKED_PET = 'staked-pet',
    UN_STAKE_PET_TRANSACTION_SENT = 'un-stake-pet-transaction-sent',
    UN_STAKED_PET = 'un-staked-pet',
    ADVENTURE_GOLD_CLAIM_TRANSACTION_SENT = 'adventure-gold-claim-transaction-sent',
    ADVENTURE_GOLD_CLAIMED = 'adventure-gold-claimed'
}

/**
 * Service to push out async messages
 */
export class PusherService {

    private pusher: PUSHER;

    constructor() {
        if (Environment.env.PUSHER_CREDENTIALS) {
            const creds: any = JSON.parse(Environment.env.PUSHER_CREDENTIALS);
            // create a instance of pusher using your credentials
            this.pusher = new PUSHER({
                appId: creds.appId,
                key: creds.key,
                secret: creds.secret,
                cluster: creds.cluster,
                useTLS: true
            });
        } else {
            const client: SecretsManager = new AWS.SecretsManager({
                region: Environment.env.AWS_REGION
            });
            const params: SecretsManager.Types.GetSecretValueRequest = {
                SecretId: Environment.env.AWS_PUSHER_CREDENTIALS_NAME
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
                        const creds: any = JSON.parse(result.SecretString as string);
                        // create a instance of pusher using your credentials
                        this.pusher = new PUSHER({
                            appId: creds.appId,
                            key: creds.key,
                            secret: creds.secret,
                            cluster: creds.cluster,
                            useTLS: true
                        });
                    } else {
                        throw(new Error('Missing SecretString'));
                    }
                }
            });
        }
    }

    /**
     * Attaches the first 10 hex values from the specified ethereum address
     * to the event name, making it specific to a given user address
     * @param event
     * @param address
     */
    public eventWithAddress(event: EPusherEvent | string, address: string): string {
        const allCaps: string = address.toUpperCase();
        const toAppend: string  = allCaps.indexOf('0X') === 0 ? allCaps.slice(2, 12) : allCaps.slice(0, 10);
        return `${event}-${toAppend}`
    }

    /**
     * Sends out a pusher message (if we have initialized, otherwise ignores
     * @param event
     * @param message
     * @param personal
     */
    public async sendMessage(event: string, message: any, address?: string): Promise<void> {
        if (this.pusher) {
            await this.pusher.trigger(`coolcats-service${typeof address !== 'undefined' ? `-${address.slice(2, 12).toUpperCase()}` : ''}`, event, {
                message,
            });
        }
    }
}
