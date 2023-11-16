/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Adam Goodman
 */

import {Environment} from '../environment';
import {DatabaseService} from '../services/database.service';
import {Repository} from 'typeorm/repository/Repository';
import {BlockchainContract} from '../entity/blockchain-contract';
import {getRepository} from 'typeorm';
import {Util} from '../utility/util';
import {Coolpets} from '../entity/coolpets';
import {EStage} from '../services/pet-manager.service';
import {Config} from '../config';

export const main = async () => {
    Environment.merge();
    let database: DatabaseService = new DatabaseService(async () => {

        const coolPetRepository = getRepository<Coolpets>(Coolpets);

        const allPets: Coolpets[] = await coolPetRepository.find();
        const tokenIds = allPets.map((coolpet) => {
            return coolpet.token_id;
        })

        for (let i = 0; i < tokenIds.length; i++) {
            await fixPetStage(coolPetRepository, allPets[i]);
        }

        try {
            await coolPetRepository.save<Coolpets>(allPets);
        } catch (error) {
            console.log('=========================================');
            console.log(`     Failed to fix stage of Cool Pets    `);
            console.log('=========================================');
            console.log(error);
        }

        console.log(`Process ended.`);
    });
}

const fixPetStage = async (coolPetRepository: Repository<Coolpets>, coolpet: Coolpets) => {
    // See if we have a coolpet record
    if (!coolpet) {
        // throw new Error(`Coolpets entry with token id ${tokenId} not found. Try fix-pet`);
        console.log(`Coolpets entry not found. Try fix-pet`);
        return;
    }

    const tokenId = coolpet.token_id;

    // Grab and/or set up some things from the blockchain
    const petStageString: any = await Util.getPetStage(tokenId);
    const petStage: EStage = parseInt(petStageString);
    let stateKey: string | undefined;
    switch (petStage) {
        case EStage.EGG:
            stateKey = 'egg';
            break;
        case EStage.BLOB1:
            stateKey = 'blob1';
            break;
        case EStage.BLOB2:
            stateKey = 'blob2';
            break;
        case EStage.FINAL_FORM:
            stateKey = 'finalForm';
    }

    const newStage = Config.PET_STAGE_PATHS[stateKey as string].stageName.toLowerCase();
    if (!coolpet.stage || coolpet.stage != newStage) {
        coolpet.stage = Config.PET_STAGE_PATHS[stateKey as string].stageName.toLowerCase();

        console.log(`Fixed Cool Pet stage for PET ID: ${tokenId}`);
    } else {
        console.log(`Stage already correct for PET ID: ${tokenId}`);
    }
}

export default main;
