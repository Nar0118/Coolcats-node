/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Entity, PrimaryGeneratedColumn, Column, Index, OneToMany} from "typeorm";
import {PetInteraction} from './pet-interaction';
import {QuestHistory} from "./quest-history";

/*
This is the metadata describing a single cool pet

{
    "name":"Grass Creature #0",
    "description":"Creatures are here to be companions to the Cool Cats!",
    "attributes":[
        {"trait_type":"Element","value":"grass"},
        {"trait_type":"Hat","value":"antennadouble"},
        {"trait_type":"Face","value":"angry"},
        {"trait_type":"Chest","value":"symbol grass"},
        {"trait_type":"Arms","value":"cactus"},
        {"trait_type":"Body","value":"wave"},
        {"trait_type":"Back","value":"horse"}
    ]}

 */

@Entity({ name: 'Coolpets' })
export class Coolpets {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column("int")
    token_id: number;

    @Column("varchar", { length: 200 })
    name: string;

    @Column("varchar", { length: 1000 })
    description: string;

    @Column("varchar", { length: 300 })
    image: string;

    @Index()
    @Column("varchar", { length: 50 })
    element: string;

    @Index()
    @Column("varchar", { length: 50 })
    hat: string;

    @Index()
    @Column("varchar", { length: 50 })
    face: string;

    @Index()
    @Column("varchar", { length: 50 })
    chest: string;

    @Index()
    @Column("varchar", { length: 50 })
    arm: string;

    @Index()
    @Column("varchar", { length: 50 })
    body: string;

    @Index()
    @Column("varchar", { length: 50 })
    back: string;

    @Index()
    @Column("varchar", { length: 50, default: 'egg' })
    stage: string;

    @Index()
    @Column("int")
    air: number;

    @Index()
    @Column("int")
    fire: number;

    @Index()
    @Column("int")
    grass: number;

    @Index()
    @Column("int")
    water: number;
    
    @OneToMany(
        () => PetInteraction,
        (petInteraction) => petInteraction.coolpet,
    )
    pet_interactions: PetInteraction[];

    @OneToMany(
        () => QuestHistory,
        (questHistory) => questHistory.coolpet,
    )
    quest_history: QuestHistory[];
}
