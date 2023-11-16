import { expect } from 'chai'
import { PusherService } from '../../services/pusher.service'
import * as ethers from 'ethers'
import { DatabaseService } from '../../services/database.service';
import { Util, RevertError } from '../../utility/util';
import { abi as COOL_CATS_ABI } from '@coolcatsnft/milk-pets/artifacts/contracts/ethereum/pets/CoolCats.sol/CoolCats.json'
import { CoolCats } from '@coolcatsnft/milk-pets/artifacts/types/CoolCats'

describe('ConnectUserHandler', () => {
    describe('*estimateGas', () => {
        it.skip('an estimate gas check provides an appropriate reason at failure', async () => {
            const providerURL = 'https://rpc.v2b.testnet.pulsechain.com'
            const provider = new ethers.providers.JsonRpcProvider(providerURL)
            const privateKey = '0x89a3b486e026e89b8f99113e359a09da815121efc4752900fec0913eacdc9376'
            const signer = new ethers.Wallet(privateKey, provider)
            const ccAddress = '0x1a92f7381b9f03921564a437210bb9396471050c'
            const contract = new ethers.Contract(ccAddress, COOL_CATS_ABI, signer) as CoolCats
            try {
                await contract.estimateGas.adopt(1)
            } catch (err) {
                expect(await Util.revertReason(provider, err as RevertError)).to.eq('Exceeds maximum Cats supply')
            }
        })
    })
})