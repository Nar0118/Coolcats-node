/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {
  Column,
  Entity,
  Index, ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CatGoldAward } from './cat-gold-award';
import { BlockchainContract } from './blockchain-contract';
import {AdventureGoldAward} from "./adventure-gold-award";

@Entity({ name: 'GoldTransaction' })
export class GoldTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('datetime')
  timestamp: string;

  @Column('int')
  block_number: number;

  @Index({ unique: true })
  @Column('varchar', { length: 64 })
  guid: string;

  @Index({ unique: false })
  @Column('varchar', { length: 200 })
  trx_hash: string;

  @Column('varchar', { length: 200 })
  account: string;

  @Column('varchar', { length: 32 })
  amount: string;

  @Column('varchar', { length: 200 })
  description: string;

  @OneToMany(
    () => CatGoldAward,
    (catGoldAward) => catGoldAward.gold_transaction,
  )
  cat_gold_awards: CatGoldAward[];

  @OneToMany(
      () => AdventureGoldAward,
      (catGoldAward) => catGoldAward.gold_transaction,
  )
  adventure_gold_awards: AdventureGoldAward[];

  @ManyToOne(
    () => BlockchainContract,
    (blockchainContract) => blockchainContract.goldTransactions,
  )
  blockchainContract: BlockchainContract;
}
