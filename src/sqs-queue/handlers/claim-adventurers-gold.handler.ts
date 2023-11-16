/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {GoldTransaction} from '../../entity/gold-transaction';
import { Util, RevertError } from '../../utility/util';
import {EPusherEvent} from '../../services/pusher.service';
import { AdventurersGuild } from '@coolcatsnft/milk-pets/artifacts/types/AdventurersGuild'

type TAdventureClaimMessage = BaseMessage & {
    address: string;
    ids: number[];
}

export class ClaimAdventurersGoldHandler extends MessageHandler {
    abiCode: string = 'ADVENTURERS_GUILD';
    protected message: TAdventureClaimMessage;

    async recheckGold() {
        // Look up our GoldTransaction using the specified guid. If we already have a record,
        // do not double up. The message was handled previously and we do not want to issue more gold.
        const { guid, address } = this.message
        try {
            let goldRepository = this.databaseService.connection.getRepository<GoldTransaction>(GoldTransaction);
            const goldTransaction: GoldTransaction | undefined = await goldRepository.findOne({
                where: {
                    guid: guid.slice(2)
                }
            });
            if (goldTransaction) {
                // This message was already processed once, with a gold transaction record already present.
                throw new Error(`goldTransaction has already been processed ${guid.slice(2)}`);
            }
        } catch (error) {
            const err = error as unknown as Error
            const message = err?.message || 'goldRepository could not be accessed';

            // Send error out to pusher
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, address);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid.slice(2),
                account: address,
                errorMessage: message,
            }, 5);

            throw error
        }
    }

    public async process(): Promise<string[]> {
        await this.recheckGold()

        const { guid, ids, address } = this.message
        const contract = this.toContract<AdventurersGuild>()
        return [contract.interface.encodeFunctionData('claim', [
            address,
            ids,
            guid,
        ])]
    }
    // async gasLimit(): Promise<number> {
    //     return 700_000
    // }
    public async onSuccess(): Promise<void> {
        const { guid, address, ids } = this.message
        // Put the ids of the cats into REDIS for the contract class to pick up
        const idsKey: string = `ADVENTURE-CLAIM-GOLD=${guid.slice(2)}`;
        await Util.redisSet(idsKey, ids.join(), 900000);

        // Grab our current gold balance
        let goldBalance: string = '';
        try {
            goldBalance = await Util.goldBalance(this.provider, address);
        } catch (err) {
            // Send error out to pusher
            const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, address);
            await Util.sendPusherMessage(this.pusherService, eventToSend, {
                messageGuid: guid.slice(2),
                account: address,
                errorMessage: 'Failed to get gold balance from blockchain'
            }, 5);

            console.log(`---------> CLAIM_ADVENTURERS_GOLD Could not retrieve gold balance from blockchain. Failed address: ${address}`);
            console.log(`REASON: Failed to get gold balance from blockchain`);
            console.log('');
        }

        // Finally, send out the pusher message for adventure-claim-gold
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.ADVENTURE_GOLD_CLAIM_TRANSACTION_SENT, address);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            type: 'ADVENTURE_GOLD_CLAIM_TRANSACTION_SENT',
            messageGuid: guid.slice(2),
            account: address,
            tokenIds: ids,
            goldBalance,
        }, 5);
    }
    public origin(): string {
        return this.msg<TAdventureClaimMessage>().address
    }
    public failureMessage(): object {
        const { guid, address, ids } = this.msg<TAdventureClaimMessage>()
        return {
            type: 'CLAIM_GOLD',
            messageGuid: guid.slice(2),
            account: address,
            params: {
                address,
                ids,
                guid,
            }
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const message = err?.message || 'unknown reason';
        const reason = await Util.revertReason(this.provider, err);
        const payload = this.failureMessage()
        const address = this.origin()

        // Send error out to pusher
        const eventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, address);
        await Util.sendPusherMessage(this.pusherService, eventToSend, {
            ...payload,
            reason,
            errorMessage: message,
        }, 5);

        console.log(`---------> CLAIM_ADVENTURERS_GOLD Transaction Failed address: ${address}`);
        console.log(`REASON: ${reason}`);
        console.log(message);
    }

}
