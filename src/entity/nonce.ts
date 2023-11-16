/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

// A nonce is this 36 big per RFC4122 spec

import {
    Column,
    Entity,
    Index, ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'Nonce' })
export class Nonce {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('datetime')
    timestamp: string;

    @Index({ unique: true })
    @Column('varchar', { length: 50 })
    ip_address: string;

    @Index({ unique: true })
    @Column('varchar', { length: 36 })
    nonce: string;
}
