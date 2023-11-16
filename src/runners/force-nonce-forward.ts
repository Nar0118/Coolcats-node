import * as uuid from 'uuid'
import * as utils from '../utility/util'
import * as ethers from 'ethers'
import { Environment } from '../environment'
import * as AWS from 'aws-sdk'

export const main = async () => {
    const groups = 1
    const msgs = 1000
    Environment.merge('dev') // Change to desired stage
    console.log(Environment.env.AWS_SQS_URL);
    AWS.config.update({ region: Environment.env.AWS_REGION });
    let completed = 0
    for (let i = 0; i < msgs; i += 1) {
        const messageGroups: { [key: string]: boolean } = {}
        await Promise.all((new Array(10)).fill(null).map(async (item, i) => {
            const slug: string = uuid.v4();
            const guid: string = ethers.utils.sha256(ethers.utils.toUtf8Bytes(slug));
            const SQS = new AWS.SQS({ apiVersion: '2012-11-05' });
            const groupSuffix = i % groups
            const MessageGroupId = `SelfSend-${groupSuffix}`
            const response: any = await SQS.sendMessage({
            MessageBody: JSON.stringify({
                type: 'SELF_SEND',
                guid,
            }),
            MessageDeduplicationId: `${guid}`,
            MessageGroupId,
            QueueUrl: Environment.env.AWS_SQS_URL,
            }).promise()
            completed += 1
            if (completed % 100 === 0) {
                console.log('completed', completed)
            }
        }))
        console.log('batch', i, 'sent')
        await utils.timeout(10000)
    }
    console.log('complete')
}
