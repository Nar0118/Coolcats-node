/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';
import {PetType} from './pet-type';
import {PetUserItem} from "./pet-user-item";
import {PetInteraction} from './pet-interaction';
import {MarketplaceListing} from './marketplace-listing';

@Entity({ name: 'PetItem' })
export class PetItem {

    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar', { length: 32 })
    name: string;

    @Column('int')
    item_id: number;
    
    @Column("int")
    air: number;
    
    @Column("int")
    fire: number;
    
    @Column("int")
    grass: number;
    
    @Column("int")
    water: number;

    @OneToMany(
        () => PetUserItem,
        (petUserItem) => petUserItem.user,
    )
    pet_user_items: PetUserItem[];
    
    @OneToMany(
        () => PetInteraction,
        (petInteraction) => petInteraction.pet_item,
    )
    pet_interactions: PetInteraction[];

    @ManyToOne(
        () => PetType,
        (petType) => petType.pet_items,
    )
    pet_type: PetType;
    
    @OneToMany(
        () => MarketplaceListing,
        (marketplaceListing) => marketplaceListing.pet_item,
    )
    marketplace_listings: MarketplaceListing[];

}
