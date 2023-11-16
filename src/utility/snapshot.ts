/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {DatabaseService} from '../services/database.service';
import {BlockchainContract} from '../entity/blockchain-contract';
import {TokenTransfer} from '../entity/token-transfer';

const fs = require('fs');

export class Snapshot {
    
    private snapshot: { [key: string]: number } = { };
    
    constructor(private database: DatabaseService,
                private contract: BlockchainContract,
                private snapshotDate: Date) {
    }
    
    public async run(): Promise<void> {
        this.snapshotDate = new Date(this.snapshotDate.toUTCString());
        
        let skip: number = 0;
        const take: number = 100;
        const pad = (num: number) => { return ('00'+num).slice(-2) };
        // const snapshotDateSql: string = this.snapshotDate.getFullYear()  + '-' +
        //     pad(this.snapshotDate.getMonth() + 1)                   + '-' +
        //     pad(this.snapshotDate.getDate())                             + ' ' +
        //     pad(this.snapshotDate.getHours())                            + ':' +
        //     pad(this.snapshotDate.getMinutes())                          + ':' +
        //     pad(this.snapshotDate.getSeconds());
        const snapshotDateSql: string = this.snapshotDate.getFullYear()  + '-' +
            pad(this.snapshotDate.getMonth() + 1)                   + '-' +
            pad(this.snapshotDate.getDate())                             + ' ' +
            '22'                            + ':' +
            '00'                            + ':' +
            '00';
        
        // Process 100 records at a time
        while (true) {
            const transfers: TokenTransfer[] = await this.database.connection.createQueryBuilder(TokenTransfer, 'transfer')
                .orderBy('transfer.id')
                .where('transfer.timestamp < :snapshot AND transfer.blockchainContractId=13', { snapshot: snapshotDateSql })
                .take(take)
                .skip(skip)
                .getMany();
            transfers.forEach((transfer: TokenTransfer) => {
                if (!this.snapshot.hasOwnProperty(transfer.from)) {
                    this.snapshot[transfer.from] = 0;
                }
                if (!this.snapshot.hasOwnProperty(transfer.to)) {
                    this.snapshot[transfer.to] = 0;
                }
                const value: number = parseInt(transfer.value);
                this.snapshot[transfer.from] -= value;
                this.snapshot[transfer.to] += value;
                
                if (this.snapshot[transfer.from] === 0) {
                    delete this.snapshot[transfer.from];
                }
                if (this.snapshot[transfer.to] === 0) {
                    delete this.snapshot[transfer.to];
                }
            });
            skip += take;
            
            if (transfers.length < take) {
                // We are done with the snapshot!
                break;
            }
        }
        
        // CODE TO VALIDATE THE SUM OF ALL TOKENS ISSUES COMES OUT TO ZERO
        console.log('Completed snapshot, writing to file');
        let total: number = 0;
        for (const key in this.snapshot) {
            total += this.snapshot[key];
        }
        console.log(total);
        
        // Write file
        let content: string = '';
        for (const key in this.snapshot) {
            const toWrite: string = `${content}${key}`;
            if (toWrite.indexOf('0x') !== 0) {
                console.log('Huh?');
            }
            content = `${content}${key},${this.snapshot[key]}\n`;
        }
        try {
            fs.writeFileSync('snapshot-11-19-21-17-00-00.csv', content);
        } catch (err) {
            console.log(err);
        }
        
    }
}
