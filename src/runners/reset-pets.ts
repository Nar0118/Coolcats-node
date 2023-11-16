import {Environment} from "../environment";
import {DatabaseService} from "../services/database.service";
import {Util} from "../utility/util";

export const main = async () => {
    Environment.merge();
    let database: DatabaseService = new DatabaseService(async () => {
        if (Environment.env.mode === 'prod') {
            throw new Error(`Resetting the pets database on production is probably an error.`);
        }
        console.log(`+====================+`);
        console.log(`| RESETTING DATABASE |`);
        console.log(`+====================+`);
        await Util.resetPetsDatabase(false);
    })
    // await database.connection.close();
}