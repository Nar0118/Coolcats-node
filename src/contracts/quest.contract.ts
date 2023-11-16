/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {ContractListener} from './contract-listener.contract';
import {BlockchainContract} from '../entity/blockchain-contract';
import {DatabaseService} from '../services/database.service';
import {EPusherEvent, PusherService} from '../services/pusher.service';
import {PetManagerService} from '../services/pet-manager.service';
import {TUserReferenceQuest, Util} from '../utility/util';
import {getManager, getRepository, Repository} from "typeorm";
import {QuestTheme} from "../entity/quest-theme";
import {QuestIo} from "../entity/quest-io";
import {Status} from "../utility/enums";
import {User} from "../entity/user";
import {QuestSelection} from "../entity/quest-selection";
import {QuestHistory} from "../entity/quest-history";
import {Coolpets} from "../entity/coolpets";
import Web3 from "web3";
import {IQuestData} from '../reset-pets';
import {BigNumber, ethers} from "ethers";

// Define types used in this class

type TLogQuestCreated = {
    returnValues: {
        questId: number;
    }
}

type TLogQuestIoCreated = {
    returnValues: {
        ioId: number;
        rarity: number;

        goldRequirements: number;
        itemRequirements: number;

        bonus: number;
        minGold: number;
        maxGold: number;

        items: number[];
    }
}

type TLogQuestIoEdited = {
    returnValues: {
        ioId: number;
        rarity: number;

        goldRequirements: number;
        itemRequirements: number;

        bonus: number;
        minGold: number;
        maxGold: number;

        items: number[];
    }
}

type TLogQuestIoDeleted = {
    returnValues: {
        ioId: number;
    }
}

type TLogRollUserQuestEvent = {
    returnValues: {
        user: string;
        reRoll: boolean;
        random: string;
        entropy: number;
    }
}

type TLogQuestCompletedEvent = {
    blockNumber: number;
    returnValues: {
        user: string;
        questId: number;
        element: number;
        ioId: number;
        petTokenId: number;
        rewardStruct: {
            totalReward: string;
            baseReward: string;
            elementBonus: string;
            petStageBonus: string;
            modifiedBase: string;
        }
    }
}

export class QuestContract extends ContractListener {

    private blockchainContract: BlockchainContract;
    private database: DatabaseService;
    private web3: Web3;

    constructor(pusherService: PusherService) {
        super(pusherService);
    }

    /**
     * Method to parse events received from the QUEST
     * @param events
     * @param blockchainContract
     * @param database
     * @param web3
     */
    public async parseEvents(events: any, blockchainContract: BlockchainContract, database: DatabaseService, web3: Web3, petManager: PetManagerService): Promise<void> {

        this.web3 = web3;
        this.blockchainContract = blockchainContract;
        this.database = database;

        if (events.length > 0) {
            for (const event in events) {
                if (events.hasOwnProperty(event)) {

                    const ourEvent: any = events[event];

                    // Prepare return values for this event
                    const returnValues = ourEvent.returnValues;
                    let values = '';
                    for (const key in returnValues) {
                        if (returnValues.hasOwnProperty(key)) {
                            if (isNaN(parseInt(key, 10))) {
                                values += '<b>' + key.replace('_', '') + ':</b></br>';
                            }
                            if (isNaN(parseInt(key, 10))) {
                                values += ('' + returnValues[key])
                                    .replace('\n', '</br>')
                                    .split(',').join('</br>') + '</br>';
                            }
                        }
                    }

                    // Need to grab the timestamp from the block (very defensive here
                    // in case we cannot get the block from our provider)
                    let blockTimestamp = new Date().toISOString();
                    const blockNumber = ourEvent.blockNumber;
                    try {
                        const block: any = await web3.eth.getBlock(blockNumber, true);
                        blockTimestamp = new Date(block.timestamp * 1000).toISOString();
                    } catch (error) {
                        // TODO Notify operator that we could not get block time
                        console.log(`ERROR -> Could not get block ${blockNumber} in gold contract, using current server time`);
                    }

                    // Handle the events
                    try {
                        switch (ourEvent.event) {
                            case 'LogQuestCreated':
                                await this.logQuestCreated(ourEvent, blockTimestamp);
                                break;
                            case 'LogQuestDeleted':
                                await this.logQuestDeleted(ourEvent, blockTimestamp);
                                break;
                            case 'LogQuestIOAdded':
                                await this.logQuestIOAdded(ourEvent, blockTimestamp);
                                break;
                            case 'LogQuestIOEdited':
                                await this.logQuestIOEdited(ourEvent, blockTimestamp);
                                break;
                            case 'LogQuestIODeleted':
                                await this.logQuestIODeleted(ourEvent, blockTimestamp);
                                break;
                            case 'LogRollQuest':
                                await this.logRollQuestEvent(ourEvent, blockTimestamp);
                                break;
                            case 'LogQuestCompleted':
                                await this.logQuestCompletedEvent(ourEvent, blockTimestamp, web3);
                                break;
                            case 'LogQuestingPaused':
                                await this.logQuestingPausedEvent(ourEvent, blockTimestamp);
                                break;
                            case 'LogChangeDailyQuestAllowance':
                                await this.logChangeDailyQuestAllowanceEvent(ourEvent, blockTimestamp);
                                break;
                            case 'LogChangeNumberOfRolls':
                                await this.logChangeNumberOfRollsEvent(ourEvent, blockTimestamp);
                                break;
                        }
                    } catch (err: any) {
                        console.log(`=============================================`);
                        console.log(`Quest contract failed to process event ${ourEvent.event}`);
                        console.log(`=============================================`);
                        console.log(err);

                        // Send error off to newrelic
                        const message: string = err && err.message ? err.message : 'Unknown error parsing events in quest.contract.ts';
                        Util.noticeError(err, { message });

                        // TODO Figure out what pusher messages to send here
                        // Send out a pusher error message if we have a user account to send it to
                        if (ourEvent?.returnValues?.user) {
                            const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.DATABASE_ERROR, ourEvent.returnValues.user);
                            await Util.sendPusherMessage(this.pusherService, successEventToSend, {
                                account: ourEvent.returnValues.user,
                                event: ourEvent.event,
                                message
                            }, 5, ourEvent.returnValues.user);
                        }
                    }
                }
            }
        }
    }

    /**
     * event LogQuestCreated(uint256 questId);
     *
     * Needs to fetch the relevant Quest Theme Data provided by the World Building department
     * from the KeyValue table and save it in the Quest Theme table.
     * By default, a quest added should have its status set to ACTIVE.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestCreated(ourEvent: TLogQuestCreated, blockTimestamp: string): Promise<void> {
        const questRepo = getRepository<QuestTheme>(QuestTheme);

        const questThemeString: string | undefined = await Util.getValue('QUEST_THEME', `theme-${ourEvent.returnValues.questId}`);
        if (!questThemeString) {
            throw new Error(`LogQuestCreated event: No theme found for questId ${ourEvent.returnValues.questId}`)
        }

        try {
            const questThemeData: IQuestData = JSON.parse(questThemeString);
            const quest: QuestTheme = new QuestTheme();

            quest.quest_id = ourEvent.returnValues.questId;
            quest.status = Status.ACTIVE;
            quest.title = questThemeData.Title;
            quest.icon = questThemeData.iconUrl;
            quest.quest_giver = questThemeData["Quest Giver"];
            quest.description = questThemeData.Description;
            quest.minor_success = questThemeData["Minor Success"];
            quest.major_success = questThemeData["Major Success"];

            await questRepo.save<QuestTheme>(quest);

            console.log(`Added quest ${quest.quest_id} - ${quest.title}`);

        } catch (error) {
            throw new Error(`LogQuestCreated event: Could not create entry in table for questId ${ourEvent.returnValues.questId}`);
        }
    }

    /**
     * event LogQuestDeleted(uint256 questId);
     *
     * Needs to change the status of an entry in the Quest Theme table from ACTIVE to DPRC
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestDeleted(ourEvent: any, blockTimestamp: string): Promise<void> {
        const questRepo = getRepository<QuestTheme>(QuestTheme);
        const questTheme: QuestTheme | undefined = await questRepo.findOne({where: {
                quest_id: ourEvent.returnValues.questId,
                status: Status.ACTIVE
            }})
        if (!questTheme) {
            throw new Error(`LogQuestDeleted event: Could not load active Quest Theme Data for questId ${ourEvent.returnValues.questId}`);
        }
        questTheme.status = Status.DPRC;
        await questRepo.save<QuestTheme>(questTheme);
    }

    /**
     * event LogQuestIOAdded(
     *      uint256 ioId,
     *      uint256 rarity,
     *      uint256 goldRequirements,
     *      uint256 itemRequirements,
     *      uint256 bonus,
     *      uint256 minGold,
     *      uint256 maxGold,
     *      uint16[] items
     *      );
     *
     *      This should take add a new entry into the QuestIo table with the parameters
     *      supplied by the event.
     *      By default, the QuestIO should have its status set as ACTIVE.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestIOAdded(ourEvent: TLogQuestIoCreated, blockTimestamp: string): Promise<void> {
        const questIoRepo = getRepository<QuestIo>(QuestIo);

        try {
            const questIo = new QuestIo();

            questIo.status = Status.ACTIVE;

            questIo.io_id = ourEvent.returnValues.ioId;
            questIo.rarity = ourEvent.returnValues.rarity;

            questIo.gold_requirement = ourEvent.returnValues.goldRequirements;
            questIo.item_requirement = ourEvent.returnValues.itemRequirements;

            questIo.bonus = ourEvent.returnValues.bonus;
            questIo.min_gold = ourEvent.returnValues.minGold;
            questIo.max_gold = ourEvent.returnValues.maxGold;

            questIo.items = ourEvent.returnValues.items.join(",");

            await questIoRepo.save<QuestIo>(questIo);
        } catch (error) {
            throw new Error(`LogQuestIoCreated event: Could not save QuestIo data for ioId ${ourEvent.returnValues.ioId}`);
        }
    }

    /**
     * event LogQuestIOEdited(
     *      uint ioId,
     *      uint256 rarity,
     *      uint256 goldRequirements,
     *      uint256 itemRequirements,
     *      uint256 bonus,
     *      uint256 minGold,
     *      uint256 maxGold,
     *      uint16[] items
     *      );
     *
     *      Should edit the entry in the QuestIo table to reflect the new parameters
     *      This event should not effect the status of a QuestIO, and should only effect
     *      the currently active entry for a given ioId
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestIOEdited(ourEvent: TLogQuestIoEdited, blockTimestamp: string): Promise<void> {
        const questIoRepo = getRepository<QuestIo>(QuestIo);

        const questIo: QuestIo | undefined = await questIoRepo.findOne({where: {
                status: Status.ACTIVE,
                io_id: ourEvent.returnValues.ioId
            }});
        if (!questIo) {
            throw new Error(`LogQuestIOEdited event: Could not load active Quest Io Data for ioId ${ourEvent.returnValues.ioId}`);
        }

        try {
            questIo.rarity = ourEvent.returnValues.rarity;

            questIo.gold_requirement = ourEvent.returnValues.goldRequirements;
            questIo.item_requirement = ourEvent.returnValues.itemRequirements;

            questIo.bonus = ourEvent.returnValues.bonus;
            questIo.min_gold = ourEvent.returnValues.minGold;
            questIo.max_gold = ourEvent.returnValues.maxGold;

            questIo.items = ourEvent.returnValues.items.join(",");

            await questIoRepo.save<QuestIo>(questIo);
        } catch (error) {
            throw new Error(`LogQuestIOEdited event: Could not save QuestIo data for ioId ${ourEvent.returnValues.ioId}`);
        }
    }

    /**
     * event LogQuestIODeleted(uint id);
     *
     * Change the status of a QuestIo from ACTIVE to DRPC
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestIODeleted(ourEvent: TLogQuestIoDeleted, blockTimestamp: string): Promise<void> {
        const questIoRepo = getRepository<QuestIo>(QuestIo);
        const questIo: QuestIo | undefined = await questIoRepo.findOne({where: {
                io_id: ourEvent.returnValues.ioId,
                status: Status.ACTIVE
            }})
        if (!questIo) {
            throw new Error(`LogQuestIODeleted event: Could not load active Quest Io Data for ioId ${ourEvent.returnValues.ioId}`);
        }
        questIo.status = Status.DPRC;
        await questIoRepo.save<QuestIo>(questIo);
    }

    /**
     * event LogRollQuestEvent(address user, bool reRoll, uint256 entropy, uint256[] quests);
     *
     * If reRoll is true, Clear the users current quests in the QuestSelection table and then add
     * an entry of the parameters.
     * To retrieve the quests from the number[] we need to perform an unpacking
     * of the integers into their respective data fields according to
     *
     *         uint256 store = _userQuests[user][index];
     *             uint256(uint8(store)),          // element
     *             uint256(uint16(store >> 8)),    // questId
     *             uint256(uint16(store >> 24))    // ioDataId
     *
     * In the above example `store` is one of the entries in the quests array we
     * are passed.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logRollQuestEvent(ourEvent: TLogRollUserQuestEvent, blockTimestamp: string): Promise<void> {
        await getManager().transaction(async transactionalEntityManager => {
            let user: User | undefined = await transactionalEntityManager.findOne<User>(User, {
                where: {
                    account: ourEvent.returnValues.user
                }
            });
            if (!user) {
                const userRepository = transactionalEntityManager.getRepository<User>(User);
                user = await Util.createUser(userRepository, ourEvent.returnValues.user);
            }

            try {
                let questSelection: QuestSelection | undefined;
                questSelection = await transactionalEntityManager.getRepository<QuestSelection>(QuestSelection).findOne({where: {
                        user
                    }});
                if (!questSelection) {
                    questSelection = new QuestSelection();
                    questSelection.user = user;
                }

                questSelection.entropy = ourEvent.returnValues.entropy

                // Unpacking instructions
                // uint256 store = _userQuests[user][index];
                // uint256(uint8(store)),          // element
                //     uint256(uint16(store >> 8)),    // questId
                //     uint256(uint16(store >> 24))    // ioDataId

                const quests: TUserReferenceQuest[] = await Util.getUserQuestsFromBlockchain(ourEvent.returnValues.user);

                questSelection.quests = JSON.stringify(quests); // Unpack here

                // Save the questSelection
                await transactionalEntityManager.save<QuestSelection>(questSelection);

            } catch (error) {
                console.log(error);
            }
        });

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.QUEST_ROLLED, ourEvent.returnValues.user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'QUEST_ROLLED',
            user: ourEvent.returnValues.user,
            reRoll: ourEvent.returnValues.reRoll,
            quests: ourEvent.returnValues.random
        }, 5, ourEvent.returnValues.user);
    }

    private numberToUint32(x: number) {
        return x >>> 0;
    }

    private numberToUint16(x: number) {
        return this.numberToUint32(x) & 0xFFFF;
    }

    private numberToUint8(x: number) {
        return this.numberToUint32(x) & 0xFF;
    }

    /**
     * event LogQuestCompletedEvent(
     *      address user,
     *      uint256 questId,
     *      uint256 ioId,
     *      uint256 petTokenId,
     *      uint256 goldAmount
     *      );
     *
     *
     * Add an entry to QuestHistory with the details of the quest they have
     * completed as defined in the event parameters.
     *
     * Clear the users current quest selection in QuestSelection
     *
     * We will need to store goldAmount as this is randomly determined at completion
     * time, the QuestIo and QuestTheme data should be stored via foreign keys.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @param web3
     * @private
     */
    private async logQuestCompletedEvent(ourEvent: TLogQuestCompletedEvent, blockTimestamp: string, web3: Web3): Promise<void> {
        let title = "";
        let icon = "";
        let description = "";
        let success = "";
        let successText = "";
        let questGiver = "";
        let rarity = 0;
        let items = "";

        await getManager().transaction(async transactionalEntityManager => {
            let user: User | undefined = await transactionalEntityManager.findOne<User>(User, {
                where: {
                    account: ourEvent.returnValues.user
                }
            });
            if (!user) {
                const userRepository = transactionalEntityManager.getRepository<User>(User);
                user = await Util.createUser(userRepository, ourEvent.returnValues.user);
            }

            const theme: QuestTheme | undefined = await transactionalEntityManager.findOne<QuestTheme>(QuestTheme, {
                where: {
                    quest_id: ourEvent.returnValues.questId,
                    status: Status.ACTIVE
                }
            })
            if (!theme) {
                throw new Error(`LogQuestCompletedEvent event: Could not find quest theme for questId ${ourEvent.returnValues.questId}`)
            }

            const io: QuestIo | undefined = await transactionalEntityManager.findOne<QuestIo>(QuestIo, {
                where: {
                    io_id: ourEvent.returnValues.ioId,
                    status: Status.ACTIVE
                }
            })
            if (!io) {
                throw new Error(`LogQuestCompletedEvent event: Could not find quest io for ioId ${ourEvent.returnValues.ioId}`)
            }

            const coolPet: Coolpets | undefined = await transactionalEntityManager.findOne<Coolpets>(Coolpets, {
                where: {
                    token_id: ourEvent.returnValues.petTokenId
                }
            })
            if (!coolPet) {
                throw new Error(`LogQuestCompletedEvent event: Could not find pet for tokenId ${ourEvent.returnValues.petTokenId}`)
            }

            const adjustedReward = BigNumber.from((parseInt(ethers.utils.formatUnits(ourEvent.returnValues.rewardStruct.baseReward, "gwei"))));
            // const mean = (io.max_gold + io.min_gold) / 2;

            // Convert io rewards to bignumber as typeorm says they are a number, but they are treated as strings when
            // compiled, this leads to unexpected behaviour when comparing them.
            const maxGold = BigNumber.from(io.max_gold);
            const minGold = BigNumber.from(io.min_gold);

            const mean = maxGold.add(minGold).div(2);

            if (adjustedReward.lte(mean)) {
                success = 'minor';
                successText = theme.minor_success;
            } else {
                success = 'major';
                successText = theme.major_success;
            }
            title = theme.title;
            icon = theme.icon;
            description = theme.description;
            questGiver = theme.quest_giver;
            rarity = io.rarity;
            items = io.items;

            // Delete the user's quest selection record
            try {
                await transactionalEntityManager.createQueryBuilder().delete()
                    .from<QuestSelection>(QuestSelection)
                    .where({ user }).execute();
            } catch (error) {
                throw new Error(`LogQuestCompletedEvent event: Could not clear quests for user account ${ourEvent.returnValues.user}`)
            }

            try {
                const questEntry = new QuestHistory();
                questEntry.user = user;
                questEntry.quest = theme;
                questEntry.io = io;
                questEntry.coolpet = coolPet;
                questEntry.element = ourEvent.returnValues.element;

                questEntry.total_milk_reward = ourEvent.returnValues.rewardStruct.totalReward;
                questEntry.base_milk_reward = ourEvent.returnValues.rewardStruct.baseReward;
                questEntry.element_milk_bonus = ourEvent.returnValues.rewardStruct.elementBonus;
                questEntry.pet_stage_milk_bonus = ourEvent.returnValues.rewardStruct.petStageBonus;
                questEntry.modifier_bonus = ourEvent.returnValues.rewardStruct.modifiedBase;

                questEntry.timestamp = blockTimestamp;

                await transactionalEntityManager.save<QuestHistory>(questEntry);
            } catch (error) {
                console.log(error);
            }
        })

        // Send out a pusher message
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.QUEST_COMPLETED, ourEvent.returnValues.user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'QUEST_COMPLETED',
            user: ourEvent.returnValues.user,
            questId: ourEvent.returnValues.questId,
            element: ourEvent.returnValues.element,
            ioId: ourEvent.returnValues.ioId,
            petTokenId: ourEvent.returnValues.petTokenId,
            goldAmount: ourEvent.returnValues.rewardStruct.totalReward,
            baseAmount: ourEvent.returnValues.rewardStruct.baseReward,
            elementMilkBonus: ourEvent.returnValues.rewardStruct.elementBonus,
            petStageMilkBonus: ourEvent.returnValues.rewardStruct.petStageBonus,
            modifierBonus: ourEvent.returnValues.rewardStruct.modifiedBase,
            itemReward: items,
            title: title,
            rarity: rarity,
            icon: icon,
            description: description,
            questGiver: questGiver,
            success: success,
            successText: successText
        }, 5, ourEvent.returnValues.user);
    }

    /**
     * event LogQuestingPausedEvent(bool paused);
     *
     * Can do nothing here, or reject calls to the RollUserQuests and CompleteQuest endpoint.
     * However, the pausing is enforced in the contract.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logQuestingPausedEvent(ourEvent: any, blockTimestamp: string): Promise<void> {
        // Nothing to do here
    }

    /**
     * event LogChangeDailyQuestAllowanceEvent(uint256 number);
     *
     * Do nothing.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logChangeDailyQuestAllowanceEvent(ourEvent: any, blockTimestamp: string): Promise<void> {
        // Nothing to do here
    }

    /**
     * event LogChangeNumberOfRollsEvent(uint256 number);
     *
     * Do nothing.
     *
     * @param ourEvent
     * @param blockTimestamp
     * @private
     */
    private async logChangeNumberOfRollsEvent(ourEvent: any, blockTimestamp: string): Promise<void> {
        // Nothing to do here
    }
}
