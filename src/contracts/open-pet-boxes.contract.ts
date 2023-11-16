
import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import type Web3 from 'web3';
import { Environment } from '../environment';
import { PetManagerService } from '../services/pet-manager.service';
import { Repository } from 'typeorm';

import { EventData } from 'web3/node_modules/web3-eth-contract'
import { parseAbi, Util } from '../utility/util';
import { getProviderURL, getProvider } from '../sqs-queue/utils'
import { PusherService, EPusherEvent } from '../services/pusher.service';
import { pusher as pusherService } from '../common'
import { ethers } from 'ethers';
import { ItemFactoryV3, LogMintItemEvent } from '@coolcatsnft/milk-pets/artifacts/types/ItemFactoryV3';
import { TypedEvent } from '@coolcatsnft/milk-pets/artifacts/types/common';
export class OpenPetBoxes extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    private web3: Web3;
    private contractGet: Promise<BlockchainContract> | null;
    private contract!: ethers.Contract;
    private provider!: ethers.providers.Provider;
    constructor(pusher: PusherService) {
        super(pusher)
        this.contractGet = null
    }

    async parseEvents(
        events: EventData[],
        blockchainContract: BlockchainContract,
        database: DatabaseService,
        web3: Web3,
        petManager: PetManagerService,
    ): Promise<void> {
        this.database = database
        this.contractGet = this.contractGet || this.getItemFactory()

        if (!events.length) {
            return
        }
        await Promise.all(events.map(async (ourEvent) => {
            switch(ourEvent.event) {
                case 'LogOpenMultipleBoxes':
                    await this.parseEvent(ourEvent)
                    break
                default:
                    break
            }
        }))
    }
    async getItemFactory() {
        if (this.contractGet) {
            return this.contractGet
        }
        const contractRepository: Repository<BlockchainContract> = this.database.connection.getRepository(BlockchainContract);
        this.contractGet = contractRepository.findOne({
            where: {
                mode: Environment.env.MODE,
                code: 'ITEM_FACTORY',
            },
        }).then((contract) => {
            if (contract) {
                return contract
            }
            throw new Error('unable to find contract')
        }).catch((err) => {
            console.log(err)
            this.contractGet = null
            throw err
        })
        return this.contractGet
    }
    async getItemFactoryContract() {
        if (this.contract) {
            return this.contract
        }
        const contract = await this.contractGet
        if (!contract) {
            throw new Error('unable to load contract')
        }
        const providerURL = getProviderURL(contract.provider.split('|'))
        const provider = getProvider(providerURL)
        const ethContract = new ethers.Contract(contract.address, parseAbi(contract.abi), provider) as ItemFactoryV3
        this.contract = ethContract
        this.provider = provider
        return ethContract
    }
    async parseEvent(evnt: EventData) {
        const { account, guid: guidAsNumber } = evnt.returnValues
        // convert bignumber string into hex guid
        const guid = ethers.BigNumber.from(guidAsNumber).toHexString()
        const contract = await this.getItemFactoryContract()
        const filter = contract.filters.LogMintItem()
        const logMintItemEvents = await contract.queryFilter<LogMintItemEvent>(filter, evnt.blockHash)
        // get only LogMintItems for this account under the matching transaction hash
        // only works if we only allow 1 per meta tx
        const mintEventsForUser = logMintItemEvents.filter((event): event is LogMintItemEvent => {
            const logMintItemEvent = event as LogMintItemEvent
            return event.event === 'LogMintItem'
                && logMintItemEvent.args.owner === account
                && logMintItemEvent.transactionHash === evnt.transactionHash
        }) as LogMintItemEvent[]
        // generate the list of items and their minted quantities
        const itemsMinted = mintEventsForUser.reduce((itemsMinted: number[], event: LogMintItemEvent) => {
            itemsMinted[event.args.tokenId.toNumber()] += event.args.amount.toNumber()
            return itemsMinted
        }, new Array(50).fill(0))
        const quantity = mintEventsForUser.length
        const successEventToSend = pusherService.eventWithAddress(EPusherEvent.OPEN_PET_BOXES, account);
        await Util.sendPusherMessage(pusherService, successEventToSend, {
            type: 'OPEN_PET_BOXES',
            messageGuid: guid.slice(2),
            account,
            quantity: quantity,
            itemsMinted,
        }, 5, account);
    }
}
