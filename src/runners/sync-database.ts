/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Environment} from '../environment';
import {DatabaseService} from '../services/database.service';
import {Repository} from 'typeorm/repository/Repository';
import {BlockchainContract} from '../entity/blockchain-contract';
import {getRepository} from 'typeorm';
import {CoolcatOwner} from '../entity/coolcat-owner';
import {IPetItemInteraction, Util} from '../utility/util';
import {Coolpets} from '../entity/coolpets';
import {EStage, PetManagerService} from '../services/pet-manager.service';
import {Config} from '../config';
import {PetItem} from "../entity/pet-item";

export const main = async () => {
    Environment.merge();
    let database: DatabaseService = new DatabaseService(async () => {
    
        console.log(`Database synchronized for environment: ${Environment.env.MODE}`);
    
    }, true);
}

export default main;
