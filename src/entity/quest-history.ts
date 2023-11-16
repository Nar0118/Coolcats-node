/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {QuestTheme} from "./quest-theme";
import {QuestIo} from "./quest-io";
import {Coolpets} from "./coolpets";
import {User} from "./user";

enum Element {
    NONE = 0,
    EARTH = 1,
    AIR = 2,
    FIRE = 3,
    WATER = 4
}

@Entity({name: 'QuestHistory'})
export class QuestHistory {

    @PrimaryGeneratedColumn()
    id: number;

    // @Index( { unique: false })
    // @Column('varchar', { length: 50 })
    // user: string;

    @ManyToOne(
        () => User,
        (user) => user.quest_history,
    )
    user: User;

    @ManyToOne(
        () => Coolpets,
        (coolPet) => coolPet.quest_history,
    )
    coolpet: Coolpets;

    @ManyToOne(
        () => QuestTheme,
        (quest) => quest.quest_history,
    )
    quest: QuestTheme;

    @ManyToOne(
        () => QuestIo,
        (io) => io.quest_history,
    )
    io: QuestIo;

    @Column({
        type: "enum",
        enum: Element,
        default: Element.NONE
    })
    element: Element;

    @Column('varchar', { length: 32 })
    total_milk_reward: string;

    @Column('varchar', { length: 32 })
    base_milk_reward: string;

    @Column('varchar', { length: 32 })
    element_milk_bonus: string;

    @Column('varchar', { length: 32 })
    pet_stage_milk_bonus: string;

    @Column('varchar', { length: 32 })
    modifier_bonus: string;

    @Column('datetime')
    timestamp: string;
}