/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */


import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import { AdventurersGuild } from '@coolcatsnft/milk-pets/artifacts/types/AdventurersGuild';

type TLogPetStaked = BaseMessage & {
    user: string;
    tokensIds: number[];
}

export class StakeHandler extends MessageHandler {
    abiCode: string = 'ADVENTURERS_GUILD'
    protected message: TLogPetStaked;

    public async process(): Promise<string[]> {
        const contract = this.toContract<AdventurersGuild>()
        const { user, tokensIds } = this.message
        return [contract.interface.encodeFunctionData('stake', [
            user,
            tokensIds,
        ])]
    }
    // async gasLimit(): Promise<number> {
    //     return 700_000
    // }
    public async onSuccess(): Promise<void> {
        const { user, guid, tokensIds } = this.message
        // If we get here, the user has successfully executed a ADVENTURERS_GUILD transaction
        // Finally, send out the pusher message for stake-pet-transaction-sent
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.STAKE_PET_TRANSACTION_SENT, user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'STAKE_PET_TRANSACTION_SENT',
            messageGuid: guid.slice(2),
            user,
            tokensIds,
        }, 5, user);
    }
    public origin(): string {
        return this.msg<TLogPetStaked>().user
    }
    public async onFailure(err: RevertError): Promise<void> {
        const errorMessage: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const payload = this.failureMessage()

        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, this.origin());
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            reason,
            errorMessage,
        }, 5, this.origin());

        console.log('---------> STAKE_PET Transaction Failed');
    }
    failureMessage() {
        const { guid, user, tokensIds } = this.message
        return {
            type: 'STAKE_PET',
            messageGuid: guid.slice(2),
            account: user,
            params: {
                user,
                tokensIds,
            },
        }
    }
}
