/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Column, Entity, Index, OneToMany, PrimaryGeneratedColumn} from "typeorm";
import {QuestHistory} from "./quest-history";
import {QuestSelection} from "./quest-selection";
import {Status} from "../utility/enums";

export enum QuestRarity {
    COMMON = 0,
    UNCOMMON = 1,
    RARE = 2,
    EPIC = 3,
    LEGENDARY = 4
}

@Entity({name: 'QuestIo'})
export class QuestIo {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "enum",
        enum: Status,
        default: Status.ACTIVE
    })
    status: Status;

    @Index({unique: false})
    @Column('int')
    io_id: number;

    @Column({
        type: "enum",
        enum: QuestRarity,
        default: QuestRarity.COMMON
    })
    rarity: QuestRarity;

    @Column('bigint')
    gold_requirement: number;

    @Column('int')
    item_requirement: number;

    @Column('int')
    bonus: number;

    @Column('bigint')
    min_gold: number;

    @Column('bigint')
    max_gold: number;

    @Column('varchar', {length: 256})
    items: string;

    @OneToMany(
        () => QuestHistory,
        (historyEntry) => historyEntry.io,
    )
    quest_history: QuestHistory[];
}
