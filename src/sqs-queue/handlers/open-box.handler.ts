/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import { OpenPetBoxes } from '@coolcatsnft/milk-pets/artifacts/types/OpenPetBoxes';
import { Transaction } from '@0xsequence/transactions';
import _ from 'lodash';

type OpenBoxMessage = BaseMessage & {
  address: string;
  quantity?: number | string;
}

export class OpenBoxHandler extends MessageHandler {
    abiCode: string = 'OPEN_PET_BOXES'
    protected entropyMultiplier: number = 3600000;
    protected message: OpenBoxMessage;

    public async process(): Promise<string[]> {
        return []
    }
    async processMessage(): Promise<Transaction[]> {
        const gasLimit = await this.gasLimit()
        const { address, guid, quantity = 1 } = this.msg<OpenBoxMessage>()
        const contract = this.toContract<OpenPetBoxes>()
        const to = this.to()
        const zeros = (new Array(parseInt(quantity as unknown as string))).fill(0)
        return _.chunk(zeros, 20).map((zeros) => ({
            to,
            gasLimit: gasLimit * (zeros.length + 1),
            data: contract.interface.encodeFunctionData('openMultipleBoxes', [
                address,
                zeros.length,
                this.generateEntropy(),
                guid,
            ]),
        }))
    }
    maxGrouping(): number {
        return 2
    }
    async gasLimit(): Promise<number> {
        return 180_000 // per one open box
    }
    public async onSuccess(): Promise<void> {
        const { guid, address, quantity } = this.message
        // If we get here, the user has successfully executed a OPEN_BOX transaction
        // Finally, send out the pusher message for buy-box-transaction-sent
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BOX_OPENED_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'OPEN_BOX',
            messageGuid: guid.slice(2),
            account: address,
            quantity
        }, 5, address);
    }
    public origin(): string {
        return this.msg<OpenBoxMessage>().address
    }
    public failureMessage(): object {
        const { guid, address, quantity } = this.message
        return {
            type: 'OPEN_BOX',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                quantity
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);

        // Send error out to pusher
        const address = this.origin()
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, address);
        const payload = this.failureMessage()
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, address);
    }
}
