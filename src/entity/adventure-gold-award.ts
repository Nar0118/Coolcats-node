/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {
    Column,
    Entity,
    Index,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { GoldTransaction } from './gold-transaction';

@Entity({ name: 'AdventureGoldAward' })
export class AdventureGoldAward {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column('int')
    token_id: number;

    @Column('datetime')
    timestamp: string;

    @ManyToOne(
        () => GoldTransaction,
        (goldTransaction) => goldTransaction.adventure_gold_awards,
        { onDelete: 'CASCADE' }
    )
    gold_transaction: GoldTransaction;
}
