import main from '../runners/load-test-open-box'
import * as yargs from 'yargs'

const argv = yargs.options({
    messages: {
        type: 'number',
        default: 100,
        describe: 'the number of messages to send',
    },
    groups: {
        type: 'number',
        default: 1,
        describe: 'the number of groups to split the messages across',
    },
    ramp: {
        type: 'boolean',
        default: true,
        describe: 'the script should ramp up message production parabolically',
    },
}).parse(process.argv.slice(2))

run()

async function run() {
    const args = await argv
    await main(args).catch(console.error)
}