/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Column, Entity, Index, OneToMany, PrimaryGeneratedColumn} from "typeorm";
import {QuestHistory} from "./quest-history";
import {Status} from "../utility/enums";


@Entity({name: 'QuestTheme'})
export class QuestTheme {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({unique: false})
    @Column('int')
    quest_id: number;

    @Column({
        type: "enum",
        enum: Status,
        default: Status.ACTIVE
    })
    status: Status;

    @Column('varchar', {length: 256})
    title: string;

    @Column('varchar', {length: 256})
    quest_giver: string;

    @Column('varchar', {length: 256})
    icon: string;

    @Column('text')
    description: string;

    @Column('text')
    minor_success: string;

    @Column('text')
    major_success: string;

    @OneToMany(
        () => QuestHistory,
        (historyEntry) => historyEntry.quest,
    )
    quest_history: QuestHistory[];
}
