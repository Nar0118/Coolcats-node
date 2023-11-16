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

@Entity({ name: 'PetUserItem' })
export class PetUserItem {

    @PrimaryGeneratedColumn()
    id: number;

    @Column('int')
    quantity: number;

    @ManyToOne(
        () => User,
        (user) => user.pet_user_items,
    )
    user: User;

    @ManyToOne(
        () => PetItem,
        (petItem) => petItem.pet_user_items,
    )
    pet_item: PetItem;

}
