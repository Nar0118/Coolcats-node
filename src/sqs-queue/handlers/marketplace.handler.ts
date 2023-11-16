/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import { MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils'
import {EPusherEvent} from '../../services/pusher.service';
import {Util, RevertError} from '../../utility/util';
import { ethers } from 'ethers';
import { MarketplaceV2 } from '@coolcatsnft/milk-pets/artifacts/types/MarketplaceV2'

const errUnrecognizedTransactionType = new Error('unrecognized marketplace transaction')

export enum EMarketplaceTransaction {
    CREATE_LISTING = 'CREATE_LISTING',
    REMOVE_LISTING = 'REMOVE_LISTING',
    BUY_LISTING = 'BUY_LISTING',
}

const transactionTypeToPusherEvent = {
  [EMarketplaceTransaction.BUY_LISTING]: EPusherEvent.BUY_LISTING_TRANSACTION_SENT,
  [EMarketplaceTransaction.CREATE_LISTING]: EPusherEvent.CREATE_LISTING_TRANSACTION_SENT,
  [EMarketplaceTransaction.REMOVE_LISTING]: EPusherEvent.REMOVE_LISTING_TRANSACTION_SENT,
}

const estimateGas = async (contract: MarketplaceV2, txType: string, ourMessage: any) => {
    switch (txType) {
        case EMarketplaceTransaction.CREATE_LISTING:
            const priceWei = ethers.utils.parseUnits(ourMessage.price.toString(), 18)
            return await contract.estimateGas.createListing(
                ourMessage.itemTokenId,
                ourMessage.amount,
                priceWei,
                ourMessage.seller,
            )
        case EMarketplaceTransaction.REMOVE_LISTING:
            return await contract.estimateGas.removeListing(
                ourMessage.listingId,
                ourMessage.seller,
            )
        case EMarketplaceTransaction.BUY_LISTING:
            return await contract.estimateGas.buyListing(
                ourMessage.buyer,
                ourMessage.listingId,
            )
        default:
            throw errUnrecognizedTransactionType
    }
}

type MarketplaceMessage = BaseMessage & {
  type: EMarketplaceTransaction;
  seller: string;
  buyer: string;
  messageGuid?: string;
  itemTokenId: number;
  amount: string;
  listingId: string;
  price: number;
}

const encodeTx = (contract: MarketplaceV2, msg: MarketplaceMessage): string => {
    switch(msg.type) {
        case EMarketplaceTransaction.CREATE_LISTING:
            const priceWei = ethers.utils.parseUnits(msg.price.toString(), 18)
            return contract.interface.encodeFunctionData('createListing', [
                msg.itemTokenId,
                msg.amount,
                priceWei,
                msg.seller,
            ])
        case EMarketplaceTransaction.REMOVE_LISTING:
            return contract.interface.encodeFunctionData('removeListing', [
                msg.listingId,
                msg.seller,
            ])
        case EMarketplaceTransaction.BUY_LISTING:
            return contract.interface.encodeFunctionData('buyListing', [
                msg.buyer,
                msg.listingId,
            ])
        default:
            throw errUnrecognizedTransactionType
    }
}

export class MarketplaceHandler extends MessageHandler {
    abiCode: string = 'MARKETPLACE'
    protected message: MarketplaceMessage;

    public async process(): Promise<string[]> {
        // Grab our contract (resulting in this.ethers being defined)
        const contract = this.toContract<MarketplaceV2>()

        // This method deals with multiple blockchain requests, and the caller address is
        // different depending upon which blockchain request is sent.
        const msg = this.msg() as MarketplaceMessage
        if (!transactionTypeToPusherEvent[msg.type]) {
            throw errUnrecognizedTransactionType
        }
        return [encodeTx(contract, this.msg())]
    }
    async gasLimit(): Promise<number> {
        switch (this.msg().type) {
            case EMarketplaceTransaction.BUY_LISTING:
                return 230_000
            case EMarketplaceTransaction.CREATE_LISTING:
                return 254_000
            case EMarketplaceTransaction.REMOVE_LISTING:
                return 140_000
            default:
                throw errUnrecognizedTransactionType
        }
    }
    public async onSuccess(): Promise<void> {
        // If we get here, the user has successfully executed a marketplace of some sort transaction
        // Finally, send out the pusher message for create-listing-transaction-sent
        const msg = this.msg<MarketplaceMessage>()
        const callerAddress = this.origin()
        const pusherEvent = transactionTypeToPusherEvent[msg.type]
        const successEventToSend: string = this.pusherService.eventWithAddress(pusherEvent, callerAddress);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, this.message, 5);
    }
    public origin(): string {
        const message = this.msg<MarketplaceMessage>()
        const { seller, buyer, } = message
        return buyer || seller
    }
    public failureMessage(): object {
        const msg = this.msg<MarketplaceMessage>()
        const { buyer, seller, guid } = msg
        return {
            type: msg.type,
            messageGuid: guid.slice(2),
            account: buyer || seller,
            params: msg,
        }
    }
    public async onFailure(err: RevertError): Promise<void> {
        const { message } = err
        const reason = await Util.revertReason(this.provider, err);
        const callerAddress = this.origin()
        // Send error out to pusher
        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, callerAddress);
        const payload = this.failureMessage()
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason: reason,
        }, 5)

        console.log(`---------> ${this.msg().type} Transaction Failed ${reason}`);
    }
}
