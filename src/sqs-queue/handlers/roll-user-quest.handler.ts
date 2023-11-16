/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */


import {MessageHandler} from '../message-handler';
import { BaseMessage } from '../utils';
import {EPusherEvent} from '../../services/pusher.service';
import {TUserReferenceQuest, Util, RevertError} from '../../utility/util';
import {getManager} from 'typeorm';
import {QuestSelection} from '../../entity/quest-selection';
import {User} from '../../entity/user';
import {QuestsV4} from "@coolcatsnft/milk-pets/artifacts/types/QuestsV4";

export type RollUserQuestMessage = BaseMessage & {
    user: string;
    reRoll: boolean;
}

export class RollUserQuestHandler extends MessageHandler {
    abiCode: string = 'QUEST'
    protected message: RollUserQuestMessage;

    public async process(): Promise<string[]> {
        const contract = this.toContract<QuestsV4>()
        const { user, reRoll } = this.message
        return [contract.interface.encodeFunctionData('rollUserQuests', [
            user,
            reRoll,
            this.getEntropy(),
        ])]
    }
    async gasLimit(): Promise<number> {
        return 150_000
    }
    public async onSuccess(): Promise<void> {
        const { guid, user, reRoll } = this.message
        // If we get here, the user has successfully executed a QUEST transaction
        // Finally, send out the pusher message for roll-user-quest-transaction-sent
        const successEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.ROLL_USER_QUEST_TRANSACTION_SENT, user);
        await Util.sendPusherMessage(this.pusherService, successEventToSend, {
            type: 'ROLL_USER_QUEST_TRANSACTION_SENT',
            messageGuid: guid.slice(2),
            user,
            reRoll
        }, 5, user);
    }

    public origin(): string {
        return this.msg<RollUserQuestMessage>().user
    }

    public async onFailure(err: RevertError): Promise<void> {
        let message: string = err.message || 'unknown reason';
        let reason = await Util.revertReason(this.provider, err);
        const payload = this.failureMessage()
        const user = this.origin()

        const errorEventToSend: string = this.pusherService.eventWithAddress(EPusherEvent.BLOCKCHAIN_ERROR, user);

        // When we get an error, let's re-sync with the blockchain
        const questSyncFix: boolean = await RollUserQuestHandler.resyncSelectedQuests(user);
        if (questSyncFix) {
            (payload as any).params.rescan = questSyncFix;
        }

        // Send error out to pusher
        await Util.sendPusherMessage(this.pusherService, errorEventToSend, {
            ...payload,
            errorMessage: message,
            reason,
        }, 5, user);

        console.log(`---------> ROLL_USER_QUEST Transaction Failed address: ${user}`);
        console.log(`REASON: ${reason}`);
        console.log(message);
    }

    public failureMessage(): object {
        const { guid, user, reRoll } = this.message
        const params: any = {
            user,
            reRoll,
        }

        return {
            type: 'ROLL_USER_QUEST',
            messageGuid: guid.slice(2),
            account: user,
            params,
        }
    }

    /**
     * Re-syncs user selected quests with blockchain
     * @param account
     * @param reRoll
     * @private
     */
    public static async resyncSelectedQuests(account: string): Promise<boolean> {

        let toRet = false;
        try {
            const userQuests: TUserReferenceQuest[] = await Util.getUserQuestsFromBlockchain(account);
            await getManager().transaction(async transactionalEntityManager => {
                const user: User | undefined = await transactionalEntityManager.findOne<User>(User, {
                    where: {
                        account
                    }
                });
                if (user) {

                    // Delete the old one (if there was one)
                    await transactionalEntityManager.createQueryBuilder().delete()
                        .from<QuestSelection>(QuestSelection)
                        .where("userId = :uid", {uid: user.id}).execute();

                    if (userQuests.length > 0) {
                        // Add back the user quests
                        const questSelection = new QuestSelection();
                        questSelection.user = user;
                        questSelection.quests = JSON.stringify(userQuests);
                        questSelection.entropy = 0;
                        transactionalEntityManager.getRepository<QuestSelection>(QuestSelection).save(questSelection);
                    }
                    toRet = true;
                }
            });

        } catch (error) {
            Util.noticeError(error);
        }
        return toRet;
    }
}
