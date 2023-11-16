/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GoldTransaction } from './gold-transaction';

@Entity({ name: 'CatGoldAward' })
export class CatGoldAward {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Index({ unique: true })
  @Column('int')
  token_id: number;

  @Column('datetime')
  last_timestamp: string;

  @ManyToOne(
    () => GoldTransaction,
    (goldTransaction) => goldTransaction.cat_gold_awards, { onDelete: 'CASCADE' }
  )
  gold_transaction: GoldTransaction;
}
