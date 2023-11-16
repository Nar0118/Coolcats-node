/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import {Config} from '../../config';
import { SystemCheckerV2 } from '@coolcatsnft/milk-pets/artifacts/types/SystemCheckerV2'

type ConnectUserMessage = BaseMessage & {
  address: string;
  nonce: string;
  signature: string;
}

export class ConnectUserHandler extends MessageHandler {
    abiCode: string = 'SYSTEM_CHECKER'
    protected message: ConnectUserMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<SystemCheckerV2>()
        const { address, nonce: requestNonce, signature } = this.message
        return [contract.interface.encodeFunctionData('connectUser', [
            address,
            requestNonce,
            signature,
        ])]
    }
    async gasLimit(): Promise<number> {
        return 100_000
    }
    public async onSuccess(): Promise<void> {
        const { address, guid } = this.message
        try {
            await Util.setUserNamedProperty(address, Config.USER_PROPERTY_IS_CONNECTED_KEY, 'true');
        } catch (err) {
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, address);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid.slice(2),
                account: address,
                errorMessage: `Failed to set named property ${Config.USER_PROPERTY_IS_CONNECTED_KEY} to true. However, user is connected on the blockchain.`
            }, 5, address);
            // TODO: should we early return here?
        }
        // If we get here, we successfully connected the user
        // Finally, send out the pusher message for connected user
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.USER_CONNECTED, address);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            type: 'CONNECT_USER',
            messageGuid: guid.slice(2),
            account: address
        }, 5, address);
    }
    public origin(): string {
        return this.msg<ConnectUserMessage>().address
    }
    public failureMessage(): object {
        const { address, guid, nonce, signature } = this.msg<ConnectUserMessage>()
        return {
            type: 'CONNECT_USER',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                nonce,
                signature
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason: string = await Util.revertReason(this.provider, err);
        // Send error out to pusher
        const payload = this.failureMessage()
        const origin = this.origin()
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, origin);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, origin);

        console.log(`---------------------------------------------`);
        console.log(`CONNECT_USER Transaction Failed`);
        console.log(`Message: ${message}`);
        console.log(`Reason: ${reason}`);
        console.log(`---------------------------------------------`);
    }
}
