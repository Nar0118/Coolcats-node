import * as yargs from 'yargs'
import {main} from "../runners/reset-pets";

// const argv = yargs.options({
//     messages: {
//         type: 'number',
//         default: 100,
//         describe: 'the number of messages to send',
//     }
// }).parse(process.argv.slice(2))
//
// run()
//
// async function run() {
//     const args = await argv
//     // await main(args).catch(console.error)
//     console.log(args);
// }

main().catch(console.error)
