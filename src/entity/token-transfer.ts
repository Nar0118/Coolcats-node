/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from 'typeorm';
import {BlockchainContract} from './blockchain-contract';

@Entity({ name: 'TokenTransfer' })
export class TokenTransfer {
    
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column("datetime")
    timestamp: string;
    
    @Index({ unique: false })
    @Column("varchar", { length: 200 })
    trx_hash: string;

    @Column("int")
    block_number: number;
    
    @Column("int")
    token_id: number;
    
    @Index({ unique: false })
    @Column("varchar", { length: 200 })
    from: string;
    
    @Index({ unique: false })
    @Column("varchar", { length: 200 })
    to: string;
    
    @Column("varchar", { length: 200 })
    value: string;
    
    @Column("double")
    eth: number;
    
    @ManyToOne(() => BlockchainContract, blockchainContract => blockchainContract.transfers)
    blockchainContract: BlockchainContract;
    
}
