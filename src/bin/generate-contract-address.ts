//
import * as ethers from 'ethers'
import { main } from '../runners/generate-contract-address'
import * as yargs from 'yargs'

const argv = yargs.options({
    address: {
        type: 'string',
        default: ethers.constants.AddressZero,
        describe: 'the address to generate a wallet for',
    },
}).parse(process.argv.slice(2))

run()

async function run() {
    const args = await argv
    await main(args).catch(console.error)
}