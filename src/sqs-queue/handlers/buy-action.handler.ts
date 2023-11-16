/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Sveta Danielyan
 */

import { getRepository } from 'typeorm';
import { MilkActions } from '@coolcatsnft/milk-pets/artifacts/types/MilkActions'
import { MessageHandler } from '../message-handler';
import { BaseMessage } from '../utils'
import { EPusherEvent } from '../../services/pusher.service';
import { Util, RevertError } from '../../utility/util';
import { ActionHistory } from '../../entity/action-history';
import { ActionStatus, Status } from '../../utility/enums';
import { Action } from '../../entity/action';
import { User } from '../../entity/user';

type BuyActionMessage = BaseMessage & {
    address: string;
    actionKey: string;
}

export class BuyActionHandler extends MessageHandler {
    abiCode: string = 'MILK_ACTION';
    protected message: BuyActionMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<MilkActions>()
        const { address, actionKey, guid } = this.message
        return [contract.interface.encodeFunctionData('buy', [address, actionKey, guid])]
    }

    public async onSuccess(): Promise<void> {
        const { address, guid, actionKey } = this.message

        const actionHistoryRepo = getRepository<ActionHistory>(ActionHistory);
        const actionRepo = getRepository<Action>(Action);
        const userRepo = getRepository<User>(User);

        const action = await actionRepo.findOne({
            where: {
                actionKey,
                status: Status.ACTIVE,
            }
        })
        if (!action) {
            throw new Error(` Could not find action for actionKey: ${actionKey}`);
        }

        const user = await userRepo.findOne({
            where: {
                account: address,
            }
        })
        if (!user) {
            throw new Error(` Could not find user for address: ${address}`);
        }

        const actionHistory = await actionHistoryRepo.findOne({
            where: {
                guid,
            }
        })
        if (!actionHistory) {
            throw new Error(` Could not find actionHistory for guid: ${guid}`);
        }

        actionHistory.status = ActionStatus.PROCESSING;
        await actionHistoryRepo.save<ActionHistory>(actionHistory);

        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BUY_ACTION_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'BUY_ACTION',
            messageGuid: guid.slice(2),
            account: address,
            actionKey,
            guid,
        }, 5, address);
    }

    public origin(): string {
        return this.msg<BuyActionMessage>().address
    }

    public failureMessage(): object {
        const { address, guid, actionKey } = this.msg<BuyActionMessage>()
        return {
            type: 'BUY_ACTION',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                actionKey,
                data: guid,
            },
        }
    }

    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const payload = this.failureMessage()
        const address = this.origin();
        const { actionKey, guid } = this.message


        const actionHistoryRepo = getRepository<ActionHistory>(ActionHistory);
        const actionRepo = getRepository<Action>(Action);
        const userRepo = getRepository<User>(User);

        const action = await actionRepo.findOne({
            where: {
                actionKey,
                status: Status.ACTIVE,
            }
        })
        if (!action) {
            throw new Error(` Could not find action for actionKey: ${actionKey}`);
        }

        const user = await userRepo.findOne({
            where: {
                account: address,
            }
        })
        if (!user) {
            throw new Error(` Could not find user for address: ${address}`);
        }

        const actionHistory = await actionHistoryRepo.findOne({
            where: {
                action,
                user,
                guid,
            }
        });
        if (!actionHistory) {
            throw new Error(` Could not find actionHistory for guid: ${guid}`);
        }

        actionHistory.status = ActionStatus.FAILED;
        await actionHistoryRepo.save<ActionHistory>(actionHistory);

        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, address);
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, address);
    }
}
