/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn} from 'typeorm';
import {User} from './user';
import {PetItem} from './pet-item';

@Entity({ name: 'MarketplaceListing' })
export class MarketplaceListing {
    
    @PrimaryGeneratedColumn()
    id: number;
    
    @Index({ unique: false })
    @Column("datetime")
    create_timestamp: Date;
    
    @Index({ unique: false })
    @Column("datetime")
    remove_timestamp: Date;
    
    @Index({ unique: true })
    @Column('int')
    listingId: number;
    
    @Column('int')
    tokenId: number;
    
    @Column('int')
    amount: number;
    
    @Column('int')
    price: number;
    
    @Index({ unique: false })
    @Column("varchar", { length: 200 })
    buyer: string;
    
    @ManyToOne(
        () => User,
        (user) => user.marketplace_listings,
    )
    user: User;
    
    @ManyToOne(
        () => PetItem,
        (petItem) => petItem.marketplace_listings,
    )
    pet_item: PetItem;
    
}
