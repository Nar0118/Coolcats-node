/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';
import {User} from './user';
import {PetCategory} from './pet-category';
import {PetItem} from './pet-item';
import {UserProperty} from "./user-property";
import {Coolpets} from './coolpets';

@Entity({ name: 'PetInteraction' })
export class PetInteraction {
    
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column('datetime')
    timestamp: string;
    
    @ManyToOne(
        () => User,
        (user) => user.pet_interactions,
    )
    user: User;
    
    @ManyToOne(
        () => Coolpets,
        (coolPet) => coolPet.pet_interactions,
    )
    coolpet: Coolpets;
    
    @ManyToOne(
        () => PetItem,
        (petItem) => petItem.pet_interactions,
    )
    pet_item: PetItem;
    
}
