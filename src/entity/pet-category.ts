/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Column, Entity, Index, OneToMany, PrimaryGeneratedColumn} from 'typeorm';
import {PetType} from './pet-type';

@Entity({ name: 'PetCategory' })
export class PetCategory {
    
    @PrimaryGeneratedColumn()
    id: number;
    
    @Index({ unique: true })
    @Column('varchar', { length: 67 })
    category_key: string;
    
    @Index({ unique: true })
    @Column('varchar', { length: 32 })
    name: string;

    @OneToMany(
        () => PetType,
        (petType) => petType.pet_category,
    )
    pet_types: PetType[];
    
}
