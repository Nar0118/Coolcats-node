import { expect } from 'chai'
import { gasProvider } from './utils'

describe('MessageHandler', () => {
    it('gets gas prices', async () => {
        const gasInfo = await gasProvider()
        // const serialized = Object.entries(gasInfo).reduce((memo, [key, value]) => {
        //     let val
        //     if (typeof value === 'object') {
        //         if ((value as any)._hex) {
        //             val = value.toString()
        //         } else {
        //             val = Object.entries(value).reduce((me, [key, value]) => {
        //                 me[key] = value.toString()
        //                 // console.log(key, value.toString())
        //                 return me
        //             }, {} as any)
        //         }
        //     } else {
        //         val = value.toString()
        //     }
        //     memo[key] = val
        //     return memo
        // }, {} as any)
        // console.log(JSON.stringify(serialized, null, 2))
        expect(+gasInfo.fast.maxFee.toString()).to.gt(0)
    })
})
