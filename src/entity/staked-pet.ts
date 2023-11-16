/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';

@Entity({ name: 'StakedPet' })
export class StakedPet {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column('int')
    token_id: number;

    @Column('bool')
    staked: boolean;

    @Column('datetime')
    timestamp: string;
}
