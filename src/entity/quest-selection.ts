/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {QuestTheme} from "./quest-theme";
import {QuestIo} from "./quest-io";
import {User} from "./user";

@Entity({name: 'QuestSelection'})
export class QuestSelection {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(
        () => User,
        (user) => user.quest_selection,
    )
    user: User;

    @Column('int')
    entropy: number;

    // Quest array stored as a JSON string
    @Column('text')
    quests: string;
}