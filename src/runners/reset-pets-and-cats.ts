import {Environment} from "../environment";
import {DatabaseService} from "../services/database.service";
import {Connection} from "typeorm/connection/Connection";
import {getConnection, getRepository} from "typeorm";
import {KeyValue} from "../entity/key-value";
import {CatGoldAward} from "../entity/cat-gold-award";
import {AdventureGoldAward} from "../entity/adventure-gold-award";
import {StakedPet} from "../entity/staked-pet";
import {GoldTransaction} from "../entity/gold-transaction";
import {Nonce} from "../entity/nonce";
import {PetUserItem} from "../entity/pet-user-item";
import {MarketplaceListing} from "../entity/marketplace-listing";
import {QuestHistory} from "../entity/quest-history";
import {QuestSelection} from "../entity/quest-selection";
import {QuestTheme} from "../entity/quest-theme";
import {QuestIo} from "../entity/quest-io";
import {PetInteraction} from "../entity/pet-interaction";
import {PetItem} from "../entity/pet-item";
import {PetType} from "../entity/pet-type";
import {PetCategory} from "../entity/pet-category";
import {UserProperty} from "../entity/user-property";
import {User} from "../entity/user";
import {BlockchainContract} from "../entity/blockchain-contract";
import {TokenTransfer} from "../entity/token-transfer";
import {CoolcatOwner} from "../entity/coolcat-owner";
import {Coolpets} from "../entity/coolpets";

export const main = async () => {
    Environment.merge();
    let database: DatabaseService = new DatabaseService(async () => {
        if (Environment.env.mode === 'prod') {
            throw new Error(`Resetting the pets database on production is probably an error.`);
        }
        console.log(`+====================+`);
        console.log(`| RESETTING DATABASE |`);
        console.log(`+====================+`);
        await resetPetsAndCatsDatabase();
    })
    // await database.connection.close();
}

const resetPetsAndCatsDatabase = async () => {
    try {
        const conn: Connection = getConnection();
        console.log(`Connected to database ${Environment.env.DB_CREDENTIALS.host}`);

        console.log(`Deleting CatGoldAward content`);
        await conn.createQueryBuilder().delete().from(CatGoldAward).execute();

        console.log(`Deleting AdventureGoldAward content`);
        await conn.createQueryBuilder().delete().from(AdventureGoldAward).execute();

        console.log(`Deleting StakedPet content`);
        await conn.createQueryBuilder().delete().from(StakedPet).execute();

        console.log(`Deleting GoldTransaction content`);
        await conn.createQueryBuilder().delete().from(GoldTransaction).execute();

        console.log(`Deleting Nonce content`);
        await conn.createQueryBuilder().delete().from(Nonce).execute();

        console.log(`Deleting PetUserItem content`);
        await conn.createQueryBuilder().delete().from(PetUserItem).execute();

        console.log(`Deleting MarketplaceListing content`);
        await conn.createQueryBuilder().delete().from(MarketplaceListing).execute();

        console.log(`Deleting QuestHistory content`);
        await conn.createQueryBuilder().delete().from(QuestHistory).execute();

        console.log(`Deleting QuestSelection content`);
        await conn.createQueryBuilder().delete().from(QuestSelection).execute();

        console.log(`Deleting QuestTheme content`);
        await conn.createQueryBuilder().delete().from(QuestTheme).execute();

        console.log(`Deleting QuestIo content`);
        await conn.createQueryBuilder().delete().from(QuestIo).execute();

        console.log(`Deleting PetInteraction content`);
        await conn.createQueryBuilder().delete().from(PetInteraction).execute();

        console.log(`Deleting PetItem content`);
        await conn.createQueryBuilder().delete().from(PetItem).execute();

        console.log(`Deleting PetType content`);
        await conn.createQueryBuilder().delete().from(PetType).execute();

        console.log(`Deleting PetCategory content`);
        await conn.createQueryBuilder().delete().from(PetCategory).execute();

        console.log(`Deleting UserProperty content`);
        await conn.createQueryBuilder().delete().from(UserProperty).execute();

        console.log(`Deleting User content`);
        await conn.createQueryBuilder().delete().from(User).execute();

        const blockchainContractRepository = getRepository<BlockchainContract>(BlockchainContract);
        const coolpetsBlockchainContract: BlockchainContract | undefined = await blockchainContractRepository.findOne({
            where: {
                code: 'COOLPET_721',
                mode: Environment.env.MODE
            }
        });
        if (coolpetsBlockchainContract) {
            // Clean up the database
            console.log(`Deleting TokenTransfer for PET contract id: ${coolpetsBlockchainContract.id}`);
            await conn.createQueryBuilder().delete().from(TokenTransfer).where(`blockchainContractId = :id`, {id: coolpetsBlockchainContract.id}).execute();

            console.log(`Deleting CoolcatOwner for PET contract id: ${coolpetsBlockchainContract.id}`);
            await conn.createQueryBuilder().delete().from(CoolcatOwner).where(`blockchainContractId = :id`, {id: coolpetsBlockchainContract.id}).execute();

            console.log(`Deleting Coolpets content`);
            await conn.createQueryBuilder().delete().from(Coolpets).execute();
        }

        const coolcatsBlockchainContract: BlockchainContract | undefined = await blockchainContractRepository.findOne({
            where: {
                code: 'COOLCAT_721',
                mode: Environment.env.MODE
            }
        })
        if (coolcatsBlockchainContract) {
            // Clean up the database
            console.log(`Deleting TokenTransfer for CAT contract id: ${coolcatsBlockchainContract.id}`);
            await conn.createQueryBuilder().delete().from(TokenTransfer).where(`blockchainContractId = :id`, {id: coolcatsBlockchainContract.id}).execute();

            console.log(`Deleting CoolcatOwner for CAT contract id: ${coolcatsBlockchainContract.id}`);
            await conn.createQueryBuilder().delete().from(CoolcatOwner).where(`blockchainContractId = :id`, {id: coolcatsBlockchainContract.id}).execute();

            // console.log(`Deleting Coolcats content`);
            // await conn.createQueryBuilder().delete().from(Coolcats).execute();
        }
    } catch (error) {
        console.log(error);
    }
}