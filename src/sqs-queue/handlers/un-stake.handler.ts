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

type TLogPetUnStaked = BaseMessage & {
    user: string;
    tokensIds: number[];
}

export class UnStakeHandler extends MessageHandler {
    abiCode: string = 'ADVENTURERS_GUILD'
    protected message: TLogPetUnStaked;

    async onSuccess() {
      const { user, guid, tokensIds } = this.message
      // If we get here, the user has successfully executed a ADVENTURERS_GUILD transaction
      // Finally, send out the pusher message for stake-pet-transaction-sent
      const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.UN_STAKE_PET_TRANSACTION_SENT, user);
      await Util.sendPusherMessage(this.pusherService, successEventToSend, {
          type: 'UN_STAKE_PET_TRANSACTION_SENT',
          messageGuid: guid.slice(2),
          user,
          tokensIds,
      }, 5, user);
    }

    public async process(): Promise<string[]> {
        const contract = this.toContract<AdventurersGuild>()
        const { user, tokensIds, guid } = this.message
        return [contract.interface.encodeFunctionData('unStake', [
            user,
            tokensIds,
            guid,
        ])]
    }
    // async gasLimit(): Promise<number> {
    //     return 700_000
    // }
    public origin(): string {
        return this.msg<TLogPetUnStaked>().user
    }
    async onFailure(error: RevertError) {
        const message: string = error.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, error);

        const payload = this.failureMessage()
        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, this.origin());
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, this.origin());
    }
    failureMessage(): object {
        const { user, guid, tokensIds } = this.message
        return {
            type: 'UN_STAKE_PET',
            messageGuid: guid.slice(2),
            account: user,
            params: {
                user,
                tokensIds,
            },
        }
    }
}
