import * as uuid from 'uuid'
import _ from 'lodash'
import * as ethers from 'ethers'
import { Environment } from '../environment'
import * as AWS from 'aws-sdk'

const ids = [
  12,
  14,
  35,
  36,
  37,
  38,
  39,
  43,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60
];

const classes = [
  4,
  4,
  6,
  5,
  3,
  4,
  4,
  6,
  5,
  5,
  4,
  7,
  4,
  4,
  5,
  6,
  4,
  4,
  6,
  8
];

const main = async ({
    groups = 1,
    messages = 100,
    ramp = true,
} = {}) => {
  Environment.merge()
  console.log(Environment.env.AWS_SQS_URL);
  console.log('spreading', messages, 'messages across', groups, 'groups')
  AWS.config.update({ region: Environment.env.AWS_REGION });
  let completed = 0
  const list = (new Array(messages)).fill(null)
  const SQS = new AWS.SQS({ apiVersion: '2012-11-05' });
  const chunked = _.chunk(list, 100)
  for (const msgs of chunked) {
    const index = chunked.indexOf(msgs) + 1
    const msBetween = Math.floor(1_000 / index)
    if (ramp) console.log('time between', msBetween, 'ms')
    await Promise.all(msgs.map(async (item, i) => {
      if (ramp) await timeout((i * msBetween))
      const slug: string = uuid.v4();
      const guid: string = ethers.utils.sha256(ethers.utils.toUtf8Bytes(slug));
      const groupSuffix = (completed + i) % groups
      const MessageGroupId = `ClaimGold-${groupSuffix}`
      const response: any = await SQS.sendMessage({
        MessageBody: JSON.stringify({
          type: 'CLAIM_GOLD',
          guid,
          address: '0x1FBe2C20578F86A3896f7BdCA69cCc212ff3970a',
          ids,
          classes,
          idx: i,
        }),
        MessageDeduplicationId: `${guid}`,
        MessageGroupId,
        QueueUrl: Environment.env.AWS_SQS_URL,
      }).promise()
      completed += 1
    }))
  }
  console.log('complete')
}

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default main
