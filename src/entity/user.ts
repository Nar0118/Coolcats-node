/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

// A nonce is this 36 big per RFC4122 spec

import {
    Column,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { UserProperty } from './user-property';
import { PetUserItem } from "./pet-user-item";
import { PetInteraction } from './pet-interaction';
import { MarketplaceListing } from './marketplace-listing';
import { QuestHistory } from "./quest-history";
import { QuestSelection } from "./quest-selection";
import { ActionHistory } from './action-history';

@Entity({ name: 'User' })
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column('varchar', { length: 50 })
    account: string;

    @Column('datetime')
    created: string;

    @Column('datetime')
    last_login: string;

    @OneToMany(
        () => UserProperty,
        (userProperty) => userProperty.user,
    )
    user_properties: UserProperty[];

    @OneToMany(
        () => PetUserItem,
        (petUserItem) => petUserItem.user,
    )
    pet_user_items: PetUserItem[];

    @OneToMany(
        () => PetInteraction,
        (petInteraction) => petInteraction.user,
    )
    pet_interactions: PetInteraction[];

    @OneToMany(
        () => MarketplaceListing,
        (marketplaceListing) => marketplaceListing.user,
    )
    marketplace_listings: MarketplaceListing[];

    @OneToMany(
        () => QuestHistory,
        (questHistory) => questHistory.user,
    )
    quest_history: QuestHistory[];

    @OneToMany(
        () => ActionHistory,
        (actionHistory) => actionHistory.user)
    action_history: ActionHistory[];

    @OneToMany(
        () => QuestSelection,
        (questSelection) => questSelection.user,
    )
    quest_selection: QuestSelection[];
}
