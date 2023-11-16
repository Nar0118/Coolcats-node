/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import { PetInteractionHandler as PetInteraction } from '@coolcatsnft/milk-pets/artifacts/types/PetInteractionHandler'

type PetInteractionMessage = BaseMessage & {
  address: string;
  petTokenId: number;
  itemTokenId: number;
  quantity?: number;
}

export class PetInteractionHandler extends MessageHandler {
    abiCode: string = 'PET_INTERACTION'
    protected message: PetInteractionMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<PetInteraction>()
        const { quantity = 1, address, petTokenId, itemTokenId } = this.message
        return (new Array(quantity)).fill(0).map(() => (
            contract.interface.encodeFunctionData('interact', [
                address,
                petTokenId,
                itemTokenId,
            ])
        ))
    }
    async gasLimit(): Promise<number> {
        return 180_000
    }
    public async onSuccess(): Promise<void> {
        const { address, petTokenId, guid, itemTokenId } = this.message
        // If we get here, the user has successfully executed a PET_INTERACTION transaction
        // Finally, send out the pusher message for buy-box-transaction-sent
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.PET_INTERACTION_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'PET_INTERACTION_TRANSACTION_SENT',
            messageGuid: guid.slice(2),
            account: address,
            petTokenId: petTokenId,
            itemTokenId: itemTokenId
        }, 5, address);
    }
    public origin(): string {
        return this.msg<PetInteractionMessage>().address
    }
    public failureMessage(): object {
        const { address, petTokenId, guid, itemTokenId } = this.message
        return {
            type: 'PET_INTERACTION',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                petTokenId,
                itemTokenId,
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const { address, petTokenId, guid, itemTokenId } = this.message
        // Send error out to pusher
        const origin = this.origin()
        const payload = this.failureMessage()

        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, origin);
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, origin);

        console.log('---------------------------------------------');
        console.log('---------> PET_INTERACTION Transaction Failed');
        console.log(`Message: ${message}`);
        console.log(`Reason: ${reason}`);
        console.log(`Account: ${address}`);
        console.log(`Pet ID: ${ petTokenId}`);
        console.log(`Token ID: ${ itemTokenId}`);
        console.log('---------------------------------------------');
    }
}
