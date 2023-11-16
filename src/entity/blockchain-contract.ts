/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TokenTransfer } from './token-transfer';
import { CoolcatOwner } from './coolcat-owner';
import { GoldTransaction } from './gold-transaction';

@Entity({ name: 'BlockchainContract' })
export class BlockchainContract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 500 })
  provider: string;

  @Index({ unique: false })
  @Column('varchar', { length: 10 })
  mode: string;

  @Index({ unique: false })
  @Column('varchar', { length: 50 })
  code: string;

  @Index({ unique: false })
  @Column('varchar', { length: 42 })
  address: string;

  @Column('int')
  next_block: number;

  @Column('tinyint')
  run_listener: number;

  @Column('varchar', { length: 200 })
  token_id: string;

  @Column('varchar', { length: 200 })
  description: string;

  @Column('blob')
  abi: string;

  @OneToMany(() => TokenTransfer, (transfer) => transfer.blockchainContract)
  transfers: TokenTransfer[];

  @OneToMany(() => CoolcatOwner, (owner) => owner.blockchainContract)
  owners: CoolcatOwner[];

  @OneToMany(() => GoldTransaction, (goldTransaction) => goldTransaction.blockchainContract)
  goldTransactions: GoldTransaction[];
}
