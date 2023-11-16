/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import {QuestsV4} from "@coolcatsnft/milk-pets/artifacts/types/QuestsV4";

export type CompleteQuestMessage = BaseMessage & {
  user: string;
  index: number;
  petTokenId: number;
  chosenItems: number[];
  rewardBonus: boolean;
}

export class CompleteQuestHandler extends MessageHandler {
    abiCode: string = 'QUEST'
    protected message: CompleteQuestMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<QuestsV4>()
        const {
            user,
            index,
            petTokenId,
            chosenItems,
            rewardBonus,
        } = this.message
        return [contract.interface.encodeFunctionData('completeQuestAndRoll', [
            user,
            index,
            petTokenId,
            chosenItems,
            this.getEntropy(),
            rewardBonus,
        ])]
    }
    async gasLimit(): Promise<number> {
        return 444_000
    }
    public async onSuccess(): Promise<void> {
        const {
            user,
            index,
            petTokenId,
            chosenItems,
            rewardBonus,
            guid,
        } = this.message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.COMPLETE_QUEST_TRANSACTION_SENT, user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'COMPLETE_QUEST_TRANSACTION_SENT',
            messageGuid: guid.slice(2),
            user,
            index,
            petTokenId,
            chosenItems,
            rewardBonus,
        }, 5, user);
    }
    public origin(): string {
        return this.msg<CompleteQuestMessage>().user
    }
    public failureMessage(): object {
        const {
            user,
            index,
            petTokenId,
            chosenItems,
            rewardBonus,
            guid,
        } = this.msg<CompleteQuestMessage>()
        return {
            type: 'COMPLETE_QUEST',
            messageGuid: guid.slice(2),
            account: user,
            params: {
                user,
                index,
                petTokenId,
                chosenItems,
                rewardBonus
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const origin = this.origin()
        const payload = this.failureMessage()
        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, origin);
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, origin);

        console.log(`---------> COMPLETE_QUEST Transaction Failed address: ${origin}`);
        console.log(`REASON: ${reason}`);
        console.log(message);
    }
}
