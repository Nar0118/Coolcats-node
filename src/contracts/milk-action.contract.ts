/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Sveta Danielyan
 */
import type Web3 from 'web3'
import { getManager, getRepository } from 'typeorm';
import { ContractListener } from './contract-listener.contract';
import { DatabaseService } from '../services/database.service';
import { EPusherEvent, PusherService } from '../services/pusher.service';
import { PetManagerService } from '../services/pet-manager.service';
import { BlockchainContract } from '../entity/blockchain-contract';
import { User } from "../entity/user";
import { Action } from '../entity/action';
import { ActionHistory } from '../entity/action-history';
import { Util } from '../utility/util';
import { ActionStatus, Status } from '../utility/enums';
import fetch from 'node-fetch'
import { Environment } from '../environment';
import {use} from "chai";

type TLogCreateAction = {
    returnValues: {
        actionKey: string;
        price: string;
    }
}

type TLogBuyAction = {
    returnValues: {
        actionKey: string;
        account: string;
        data: string;
    }
}

type TLogDeleteAction = {
    returnValues: {
        actionKey: string;
    }
}

type TLogEditAction = {
    returnValues: {
        actionKey: string;
        price: string;
    }
}

/**
 * This class tracks items in the Cool Cats milk action contract on the polygon network
 * The handled events are:
 *
 *  event LogBuyAction(address account, bytes32 actionKey, bytes32 data);
 * 
 *  event LogCreateAction(bytes32 actionKey, uint256 price);
 * 
 *  event LogEditAction(bytes32 actionKey, uint256 price);
 * 
 *  event LogDeleteAction(bytes32 actionKey);
 */
export class MilkAction extends ContractListener {
    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the MILK_ACTION
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {
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
                            case 'LogBuyAction':
                                await this.logBuyAction(ourEvent);
                                break;
                            case 'LogCreateAction':
                                await this.logCreateAction(ourEvent);
                                break;
                            case 'LogEditAction':
                                await this.logEditAction(ourEvent);
                                break;
                            case 'LogDeleteAction':
                                await this.logDeleteAction(ourEvent);
                                break;
                        }
                    } catch (err: any) {
                        console.log(`=============================================`);
                        console.log(`Milk action contract failed to process event ${ourEvent.event}`);
                        console.log(`=============================================`);
                        console.log(err);

                        const message: string = (err && err.message) ? err.message : 'Unknown error parsing events in milk-action.contract.ts';
                        Util.noticeError(err, { message });
                    }
                }
            }
        }
    }

    /**
     * @param event - LogBuyAction(address account, bytes32 actionKey, bytes32 data)
     * @private
     */
    private async logBuyAction(event: TLogBuyAction): Promise<void> {
        let wallet: string = '';
        let action: Action | undefined;
        const guid = event.returnValues.data;

        await getManager().transaction(async transactionalEntityManager => {
            action = await transactionalEntityManager.findOne<Action>(Action, {
                where: {
                    actionKey: event.returnValues.actionKey,
                    status: Status.ACTIVE,
                }
            });

            let user: User | undefined = await transactionalEntityManager.findOne<User>(User, {
                where: {
                    account: event.returnValues.account
                }
            });
            if (!user) {
                throw new Error(`LogBuyAction event: Could not find user for address: ${event.returnValues.account}`);
            }

            if (action) {
                const actionHistory = await transactionalEntityManager.findOne<ActionHistory>(ActionHistory, {
                    where: {
                        action,
                        user,
                        guid,
                    }
                })
                if (!actionHistory) {
                    throw new Error(` Could not find actionHistory for guid: ${guid}`);
                }

                actionHistory.status = ActionStatus.COMPLETED;
                await transactionalEntityManager.save<ActionHistory>(actionHistory);

                const { type, details, discord_id, twitter_id, token_id } = actionHistory;
                wallet = user.account;

                const url = `${Environment.env.ZAPIER}?type=${type}&description=${details}&wallet=${wallet}&discord=${discord_id}&twitter=${twitter_id}&milk=1000&nftid=${token_id}&quantity=1&guid=${event.returnValues.data}`;
                await fetch(url);
            } else {
                throw new Error(`LogBuyAction event could not be created in database for actionKey: ${event.returnValues.actionKey}`);
            }
        });

        if (!action) {
            throw new Error(`LogBuyAction event could not find action for actionKey: ${event.returnValues.actionKey}`);
        }

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.ACTION_BOUGHT, event.returnValues.account);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'ACTION_BOUGHT',
            user: wallet,
            actionKey: action.actionKey,
            actionName: action.name,
            actionDescription: action.description,
        }, 5);
    }

    /**
     * @param event - LogDeleteAction(bytes32 actionKey)
     * @private
     */
    private async logDeleteAction(event: TLogDeleteAction): Promise<void> {
        const actionRepo = getRepository<Action>(Action);
        const action: Action | undefined = await actionRepo.findOne({
            where: {
                actionKey: event.returnValues.actionKey,
                status: Status.ACTIVE,
            }
        });
        if (action) {
            action.status = Status.DPRC;
            await actionRepo.save<Action>(action);
        } else {
            throw new Error(`LogDeleteAction event: Unknown actionKey ${event.returnValues.actionKey}`);
        }
    }

    /**
     * @param event - LogEditAction(bytes32 actionKey, uint256 price)
     * @private
     */
    private async logEditAction(event: TLogEditAction): Promise<void> {
        const actionRepo = getRepository<Action>(Action);
        const action: Action | undefined = await actionRepo.findOne({
            where: {
                actionKey: event.returnValues.actionKey,
                status: Status.ACTIVE,
            }
        });
        if (action) {
            action.price = event.returnValues.price;
            await actionRepo.save<Action>(action);

        } else {
            throw new Error(`LogEditAction event: Could not save Action data for ioId ${event.returnValues.actionKey}`);
        }
    }

    /**
     * @param event - LogCreateAction(bytes32 actionKey, uint256 price)
     */
    private async logCreateAction(event: TLogCreateAction): Promise<void> {
        const actionRepo = getRepository<Action>(Action);
        try {

            const action = new Action();

            action.actionKey = event.returnValues.actionKey;
            action.price = event.returnValues.price;

            await actionRepo.save<Action>(action);

            console.log(`Added action ${action.actionKey}`);
        }
        catch (error) {
            // TODO: remove this
            console.log(error);
            throw new Error(`LogCreateAction event: Could not create entry in table for actionKey ${event.returnValues.actionKey}`);
        }

    }
}
