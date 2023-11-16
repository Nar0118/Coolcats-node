import { expect } from 'chai'
import { PusherService } from '../services/pusher.service'
import * as ethers from 'ethers'
import { DatabaseService } from '../services/database.service';
import { RevertError } from '../utility/util';
import { MessageHandler } from './message-handler'
import { BaseMessage, gasProvider } from './utils'

class MVP extends MessageHandler {
    abiCode: string = 'MVP';
    async process(): Promise<string[]> {
        return Promise.resolve([''])
    }
    async onFailure(err: RevertError): Promise<void> {}
    async onSuccess(): Promise<void> {}
    public origin(): string {
        return ''
    }
    public failureMessage(): object {
        return {}
    }
    async estimateGas(): Promise<ethers.ethers.BigNumber> {
        return ethers.BigNumber.from(0)
    }
}

describe('MessageHandler', () => {
    let instance!: MVP;
    const batchTimestamp = new Date()
    const msg = () => ({
        type: '',
        guid: '',
    })
    const db = new DatabaseService(() => {})
    const pusher = new PusherService()
    beforeEach(() => {
        instance = new MVP(
            batchTimestamp,
            db,
            new PusherService(),
            msg(),
        )
    })
    after(async () => {
        await db.disconnect()
    })
    it('has certain characteristics', () => {
        const message = msg()
        const instance = new MVP(
            batchTimestamp,
            db,
            pusher,
            message,
        )
        expect(instance).instanceof(MessageHandler)
        expect(instance.msg()).to.equal(message)
    })
    describe('#process', () => {
        it('returns an object', async () => {
            const result = await instance.process()
            expect(result[0]).to.be.a('string')
            expect(result).not.to.equal(instance.msg())
        })
    })
    describe('#getNextNonce', () => {
        it('returns a number', async () => {
            // const wellKnownMnemonic = 'test test test test test test test test test test test junk'
            const privateKey = '0x82a985a7b761e1fd53ef74bfa9c83db7ed800e182488bb97a2abb37ac411b0c8'
            const signer = new ethers.Wallet(privateKey)
            instance.connect(signer.connect(ethers.getDefaultProvider(1)))
            const nonce = await instance.getNonce()
            expect(nonce).to.be.a('number')
            expect(await instance.getNonce()).eq(nonce)
        })
    })
    describe('.gasProvider', () => {
        it('fetches externally sourced gas prices', async () => {
            const provided = await gasProvider(false)
            expect(provided.fast.maxFee.toString()).not.eq(ethers.utils.parseUnits('2.5', 9))
        })
    })
})
