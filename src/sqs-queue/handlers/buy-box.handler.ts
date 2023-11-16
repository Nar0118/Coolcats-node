/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import { Util, RevertError } from '../../utility/util';
import { ItemFactoryV3 } from '@coolcatsnft/milk-pets/artifacts/types/ItemFactoryV3'

type BuyBoxMessage = BaseMessage & {
  address: string;
  quantity: number;
}

export class BuyBoxHandler extends MessageHandler {
    abiCode: string = 'ITEM_FACTORY'
    protected message: BuyBoxMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<ItemFactoryV3>()
        const { address, quantity } = this.message
        return [contract.interface.encodeFunctionData('buyBox', [address, quantity])]
    }
    // async gasLimit(): Promise<number> {
    //     return 250_000
    // }
    public async onSuccess(): Promise<void> {
        const { address, guid, quantity } = this.message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BUY_BOX_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'BUY_BOX',
            messageGuid: guid.slice(2),
            account: address,
            quantity
        }, 5, address);
    }
    public origin(): string {
        return this.msg<BuyBoxMessage>().address
    }
    public failureMessage(): object {
        const { address, guid, quantity } = this.msg<BuyBoxMessage>()
        return {
            type: 'BUY_BOX',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                quantity,
            },
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const payload = this.failureMessage()
        const address = this.origin()

        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, address);
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, address);
    }
}
