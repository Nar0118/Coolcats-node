/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Coolcats} from '../entity/coolcats';

const request = require('request');
import {DatabaseService} from '../services/database.service';

export class CoolcatLoader {
    
    constructor(private database: DatabaseService) {
    
    }
    
    /**
     * Method to load the cool cats database from the coolcats api server
     */
    public load(index: number = 0): void {
        
        // Make sure our tables are synchronized.
        // this.database.connection.synchronize(true);
        
        const url: string = `https://api.coolcatsnft.com/cat/${index}`;
        request(url, (error: any, response: any, body: string) => {
            if (!error && response.statusCode == 200) {
                try {
                    const cat: any = JSON.parse(body);
                    const newCat: Coolcats = new Coolcats();
                    newCat.token_id = index;
                    newCat.name = cat.name;
                    newCat.ipfs_image = cat.ipfs_image;
                    newCat.google_image = cat.google_image;
                    
                    cat.attributes.forEach((trait: {trait_type: string, value: string}) => {
                        switch (trait.trait_type.toLowerCase()) {
                            case 'body':
                                newCat.body = trait.value;
                                break;
                            case 'hats':
                                newCat.hats = trait.value;
                                break;
                            case 'shirt':
                                newCat.shirt = trait.value;
                                break;
                            case 'face':
                                newCat.face = trait.value;
                                break;
                            case 'tier':
                                newCat.tier = trait.value;
                                break;
                        }
                    });
                    
                    for (const key in cat.points) {
                        switch (key.toLowerCase()) {
                            case 'body':
                                newCat.body_points = cat.points[key];
                                break;
                            case 'hats':
                                newCat.hats_points = cat.points[key];
                                break;
                            case 'shirt':
                                newCat.shirt_points = cat.points[key];
                                break;
                            case 'face':
                                newCat.face_points = cat.points[key];
                                break;
                        }
                    }
                    
                    // Populate the cat record
                    this.database.connection.manager.save(newCat).then((result: Coolcats) => {
                        console.log('Added cat ' + cat.name);
                        this.load(index + 1);
                    }, (reason: any) => {
                        console.log('Error adding cat ' + cat.name);
                        console.log('Stopping populating cats');
                        console.log(reason);
                    });
                    
                } catch (err: any) {
                    // Something went wrong :(
                    console.log(err);
                }
            }
            else {
                if (response.statusCode === 404) {
                    // We get here when we are done scraping the api server
                } else {
                    console.log(`Error ${response.statusCode}: ${response.statusMessage}`);
                }
            }
        });
    }
}
