/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Sveta Danielyan
 */

import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ActionStatus } from '../utility/enums';
import { Action } from './action';
import { User } from './user';

@Entity({ name: 'ActionHistory' })
export class ActionHistory {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column('varchar', { length: 66 })
    guid: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @Column({
        type: "enum",
        enum: ActionStatus,
        default: ActionStatus.SENT
    })
    status: ActionStatus;

    @Column('varchar', { length: 18 })
    discord_id: string;

    @Column('varchar', { length: 50 })
    twitter_id: string;

    @Column('text')
    token_id: string;

    @Column('text')
    details: string;

    @Column('varchar', { length: 50 })
    type: string;

    @ManyToOne(
        () => User,
        (user) => user.action_history,
    )
    user: User;

    @ManyToOne(
        () => Action,
        (action) => action.action_history,
    )
    action: Action;
}
