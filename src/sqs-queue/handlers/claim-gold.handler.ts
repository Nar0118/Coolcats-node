/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */
import { Treasury } from '@coolcatsnft/milk-pets/artifacts/types/Treasury';
import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {Util, RevertError} from '../../utility/util';
import {EPusherEvent} from '../../services/pusher.service';
import _ from 'lodash'

type ClaimGoldMessage = BaseMessage & {
  address: string;
  ids: number[];
  classes: number[];
}

export class ClaimGoldHandler extends MessageHandler {
    abiCode: string = 'TREASURY'
    protected message: ClaimGoldMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<Treasury>()
        const { address, ids, classes, guid } = this.message
        const chunks = Math.ceil(ids.length / 10)
        return (new Array(chunks).fill(0)).map((_a, index) => (
            contract.interface.encodeFunctionData('claim', [
                address,
                ids.slice(10 * index, (10 * index) + 10),
                classes.slice(10 * index, (10 * index) + 10),
                guid,
            ])
        ))
    }
    // async gasLimit(): Promise<number> {
    //     return 700_000
    // }

    public origin(): string {
        return this.msg<ClaimGoldMessage>().address
    }
    public failureMessage(): object {
        const { guid, address, ids, classes } = this.msg<ClaimGoldMessage>()
        return {
            type: 'CLAIM_GOLD',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                ids,
                classes,
                guid
            }
        }
    }
    async onFailure(err: RevertError) {
      const message = err?.message || 'unknown reason';
      const reason = await Util.revertReason(this.provider, err);
      const payload = this.failureMessage()
      const origin = this.origin()
      // Send error out to pusher
      const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, origin);
      await Util.sendPusherMessage(this.pusherService, eventToSend, {
          ...payload,
          reason,
          errorMessage: message,
      }, 5, origin);
    }

    async onSuccess() {
        // --------------------------------------------------------------------------------
        // ---------- We have successfully submitted the blockchain transaction -----------
        // --------------------------------------------------------------------------------

        const { guid, address, ids } = this.message
        // Put the ids of the cats into REDIS for the contract class to pick up
        const idsKey: string = `CLAIM-GOLD=${guid.slice(2)}`;
        await Util.redisSet(idsKey, ids.join(), 900000);

        // Grab our current gold balance
        const goldBalance = await Util.goldBalance(this.provider, address);

        // Finally, send out the pusher message for claim-gold
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.GOLD_CLAIM_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            type: 'CLAIM_GOLD',
            messageGuid: guid.slice(2),
            account: address,
            catIds: ids,
            goldBalance,
        }, 5, address);
    }

}
