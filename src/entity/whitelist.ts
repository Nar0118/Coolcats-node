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
import {User} from './user';

@Entity({ name: 'Whitelist' })
export class Whitelist {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Index( { unique: true })
    @Column('varchar', { length: 100 })
    address: string;
}
