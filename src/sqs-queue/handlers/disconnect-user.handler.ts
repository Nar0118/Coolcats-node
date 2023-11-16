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
import { SystemCheckerV2 } from '@coolcatsnft/milk-pets/artifacts/types/SystemCheckerV2';

type DisconnectUserMessage = BaseMessage & {
  address: string;
  nonce: string;
  signature: string;
}

export class DisconnectUserHandler extends MessageHandler {
    abiCode: string = 'SYSTEM_CHECKER'
    protected message: DisconnectUserMessage;

    public async process(): Promise<string[]> {
        // Grab our contract (resulting in this.ethers being defined)
        const contract = this.toContract<SystemCheckerV2>()
        const { address, nonce: requestNonce, signature } = this.message
        return [contract.interface.encodeFunctionData('disconnectUser', [
            address,
            requestNonce,
            signature,
        ])]
    }
    async gasLimit(): Promise<number> {
        return 80_000
    }
    public async onSuccess(): Promise<void> {
        const { address, guid } = this.message
        // If we get here, the user has connected so I am going to add a property
        // "coolcatConnected" and set it to true
        try {
            await Util.setUserNamedProperty(address, Config.USER_PROPERTY_IS_CONNECTED_KEY, 'false');
        } catch (err) {
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, address);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid.slice(2),
                account: address,
                errorMessage: `Failed to set named property ${Config.USER_PROPERTY_IS_CONNECTED_KEY} to false. However, user is disconnected on the blockchain.`
            }, 5, address);
        }
        // If we get here, we successfully disconnected the user
        // Finally, send out the pusher message for disconnected user
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.USER_DISCONNECTED, address);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            type: 'DISCONNECT_USER',
            messageGuid: guid.slice(2),
            account: address
        }, 5, address);
    }
    public origin(): string {
        return this.msg<DisconnectUserMessage>().address
    }
    public failureMessage(): object {
        const { address, guid, nonce, signature } = this.msg<DisconnectUserMessage>()
        return {
            type: 'DISCONNECT_USER',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address: address,
                nonce: nonce,
                signature: signature
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message: string = err.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        // Send error out to pusher
        const origin = this.origin()
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, origin);
        const payload = this.failureMessage()
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, origin);

        console.log(`---------------------------------------------`);
        console.log(`DISCONNECT_USER Transaction Failed`);
        console.log(`Message: ${message}`);
        console.log(`Reason: ${reason}`);
        console.log(`---------------------------------------------`);
    }
}
