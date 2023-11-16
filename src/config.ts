/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

export interface IPetTokenOffsets {
    fire: number;
    air: number;
    grass: number;
    water: number;
}

/**
 * Class holding configuration parameters for cool cats
 */
export class Config  {
    public static readonly MAX_PET_COUNT: number = 10000;
    public static readonly PET_IMAGE_PATH: string = 'pet/image/';
    public static readonly PET_THUMBNAIL_PATH: string = 'pet/thumbnail/';
    public static readonly PET_METADATA_PATH: string = 'pet/metadata/';
    public static readonly PET_STAGE_PATHS: any = {
        egg: {
            name: 'Egg',
            description: "I wonder what's inside?\n\nAn NFT offering from the Cool Cats brand, Cool Pets is a collection of 19,999 NFTs that are procedurally generated based on item interaction. All Cool Pets start as an Egg and evolve into their final form, which represents one of four elements: Grass, Fire, Water, or Air.\n\nUsers can evolve their Cool Pet through our gamified experience on [www.coolcatsnft.com](https://www.coolcatsnft.com/) \u2013 your final Cool Pet is one of 17 million possible outcomes! To learn more about Cool Pets, Eggs, and the world of Cooltopia, visit [cooltopia.coolcatsnft.com](https://cooltopia.coolcatsnft.com/). We love the Pets!",
            metadata: 'pet-stage-metadata/egg.json',
            image: 'pet-stage/egg.png',
            stageName: 'Egg'
        },
        blob1: {
            name: 'Hatching',
            description: "An NFT offering from the Cool Cats brand, Cool Pets is a collection of 19,999 NFTs that are procedurally generated based on item interaction. All Cool Pets start as an Egg and evolve into their final form, which represents one of four elements: Grass, Fire, Water, or Air.\n\nUsers can evolve their Cool Pet through our gamified experience on [www.coolcatsnft.com](https://www.coolcatsnft.com/) \u2013 your final Cool Pet is one of 17 million possible outcomes! To learn more about Cool Pets, Eggs, and the world of Cooltopia, visit [cooltopia.coolcatsnft.com](https://cooltopia.coolcatsnft.com/). We love the Pets!",
            metadata: 'pet-stage-metadata/blob1.json',
            image: 'pet-stage/blob1.png',
            stageName: 'One'
        },
        blob2: {
            name: 'Hatched',
            description: "An NFT offering from the Cool Cats brand, Cool Pets is a collection of 19,999 NFTs that are procedurally generated based on item interaction. All Cool Pets start as an Egg and evolve into their final form, which represents one of four elements: Grass, Fire, Water, or Air.\n\nUsers can evolve their Cool Pet through our gamified experience on [www.coolcatsnft.com](https://www.coolcatsnft.com/) \u2013 your final Cool Pet is one of 17 million possible outcomes! To learn more about Cool Pets, Eggs, and the world of Cooltopia, visit [cooltopia.coolcatsnft.com](https://cooltopia.coolcatsnft.com/). We love the Pets!",
            metadata: 'pet-stage-metadata/blob2.json',
            image: 'pet-stage/blob2.png',
            stageName: 'Two'
        },
        finalForm: {
            stageName: 'final_form'
        }
    };
    public static readonly PET_TOKEN_OFFSETS: IPetTokenOffsets = {
        fire: 40000,
        air: 20000,
        grass: 0,
        water: 60000
    }
    public static readonly BLOCKS_PER_QUERY: number = 500;
    public static readonly QUERY_DELAY_MS: number = 5000;
    public static readonly USER_PROPERTY_IS_CONNECTED_KEY: string = 'isConnected';
}

/**
 * Offsets for the four elements as represented by files on the private S3 bucket
 */
export enum ELEMENT_OFFSET {
    FIRE = 40000,
    WATER = 60000,
    AIR = 20000,
    GRASS = 0
}
