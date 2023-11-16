/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {
    Column,
    Entity, Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'AllowListUser' })
export class AllowListUser {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Index({ unique: true })
    @Column('varchar', { length: 200 })
    account: string;

    @Index({ unique: true })
    @Column("int")
    ticket: number;
}
