/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import {Entity, PrimaryGeneratedColumn, Column, Index} from "typeorm";

/*
This is the metadata describing a single cool cat
{
  "description": "Cool Cats is a collection of 9,999 randomly generated and stylistically curated NFTs that exist on the Ethereum Blockchain. Cool Cat holders can participate in exclusive events such as NFT claims, raffles, community giveaways, and more. Remember, all cats are cool, but some are cooler than others. Visit [www.coolcatsnft.com](https://www.coolcatsnft.com/) to learn more.",
  "image": "https://ipfs.io/ipfs/QmXT9Gaiu6Znoz8hwf4788vTy2MnhpWCLBET1gS5XNvf4r",
  "name": "Cool Cat #0",
  "attributes": [
    {
      "trait_type": "body",
      "value": "blue cat skin"
    },
    {
      "trait_type": "hats",
      "value": "knight blue"
    },
    {
      "trait_type": "shirt",
      "value": "tshirt yellow"
    },
    {
      "trait_type": "face",
      "value": "happy"
    },
    {
      "trait_type": "tier",
      "value": "wild_1"
    }
  ],
  "points": {
    "Body": 0,
    "Hats": 3,
    "Shirt": 1,
    "Face": 1
  },
  "ipfs_image": "https://ipfs.io/ipfs/QmXT9Gaiu6Znoz8hwf4788vTy2MnhpWCLBET1gS5XNvf4r",
  "google_image": "https://drive.google.com/uc?id=1OfFWwjAJFrIhz64MAtWK2Rp9K6dc7Ea0"
}

 */

@Entity({ name: 'Coolcats' })
export class Coolcats {

    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column("int")
    token_id: number;

    @Column("varchar", { length: 200 })
    name: string;

    @Column("varchar", { length: 300 })
    ipfs_image: string;

    @Column("varchar", { length: 300 })
    google_image: string;

    @Index()
    @Column("varchar", { length: 50 })
    body: string;

    @Index()
    @Column("varchar", { length: 50 })
    hats: string;

    @Index()
    @Column("varchar", { length: 50 })
    shirt: string;

    @Index()
    @Column("varchar", { length: 50 })
    face: string;

    @Index()
    @Column("varchar", { length: 50 })
    tier: string;

    @Index()
    @Column("int")
    body_points: number;

    @Index()
    @Column("int")
    hats_points: number;

    @Index()
    @Column("int")
    shirt_points: number;

    @Index()
    @Column("int")
    face_points: number;
}
