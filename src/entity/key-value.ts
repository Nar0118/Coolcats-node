/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({ name: 'KeyValue' })
export class KeyValue {
    
    @PrimaryGeneratedColumn()
    id: number;
    
    @Index({ unique: false })
    @Column('varchar', { length: 32 })
    namespace: string;
    
    @Index({ unique: false })
    @Column('varchar', { length: 32 })
    key: string;
    
    @Column('text')
    value: string;
    
}
