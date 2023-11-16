import { Account } from '@0xsequence/wallet'
export const main = async ({ address }: { address: string; }) => {
    const account = new Account({
        initialConfig: {
          threshold: 1,
          signers: [{
            weight: 1,
            address,
          }]
        }
    })
    console.log(await account.getAddress())
}
