/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';
import {User} from './user';
import {PetCategory} from './pet-category';
import {PetItem} from './pet-item';

@Entity({ name: 'PetType' })
export class PetType {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column('varchar', { length: 67 })
    type_key: string;

    @Index({ unique: true })
    @Column('varchar', { length: 32 })
    name: string;

    @OneToMany(
        () => PetItem,
        (petItem) => petItem.pet_type,
    )
    pet_items: PetItem[];

    @ManyToOne(
        () => PetCategory,
        (petCategory) => petCategory.pet_types,
    )
    pet_category: PetCategory;

}
