/*
 * Copyright (c) 2021. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

export enum EMode {
    PROD = 'prod',
    BETA = 'beta',
    SANDBOX = 'sand',
    DEV = 'dev',
    STAGE = 'stage'
}

export interface IEnvironment {
    AWS_REGION: string;
    AWS_DATABASE_SECRET_NAME: string;
    AWS_SYSTEM_WALLET_SECRET_NAME: string;
    AWS_PUSHER_CREDENTIALS_NAME: string;
    AWS_SQS_URL: string;
    AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: string;
    AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: string;
    AWS_CLOUDFRONT_DISTRIBUTION: string;
    MODE: EMode;
    DB_CREDENTIALS: string;
    SYSTEM_ACCOUNT: string;
    PUSHER_CREDENTIALS: string;
    OPENSEA_API_KEY: string;
    OPENSEA_ENDPOINT: string;
    NEW_RELIC_APP_NAME: string;
    NEW_RELIC_LICENSE_KEY: string;
    REDIS_ENDPOINT: string;
    REDIS_PORT: number;
    ZAPIER: string;
    SCAN_CONTRACTS: boolean;
}

interface IEnvMap {
    [key: string]: IEnvironment
}

export class Environment {

    private static environments: IEnvMap = {
      'prod': {
              AWS_REGION: 'us-east-1',
              SCAN_CONTRACTS: true,
              AWS_DATABASE_SECRET_NAME: 'CoolCatsProd',
              AWS_SYSTEM_WALLET_SECRET_NAME: 'SystemWallet',
              AWS_PUSHER_CREDENTIALS_NAME: 'PusherProd',
              AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/worker_api_prod.fifo',
              AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: 'metadata-coolpets-private',
              AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: 'metadata.coolcatsnft.com',
              AWS_CLOUDFRONT_DISTRIBUTION: 'ECZ8WVIDETVH9',
              MODE: EMode.PROD,
              DB_CREDENTIALS: '{"username": "produser", "password": "Fried769Batter36watch", "engine": "mysql", "host": "127.0.0.1", "port": 3334, "dbname": "coolcatsmysqlprod", "dbClusterIdentifier": "coolcats-prod-2"}',
              SYSTEM_ACCOUNT: '{"publicAddress": "0x772B92a6AbE5129F8Ef91D164Cc757dd9BbD0BC7", "privateKey": "0x89a3b486e026e89b8f99113e359a09da815121efc4752900fec0913eacdc9376"}',
              PUSHER_CREDENTIALS: '{"appId": "1289163", "key": "b349f319e8f2d7652d7a", "secret": "79b0367e00c8a99483d5", "cluster": "mt1"}',
              OPENSEA_API_KEY: 'dcda06ee1b114760bf3a934d0990eec0',
              OPENSEA_ENDPOINT: 'https://api.opensea.io/',
              NEW_RELIC_APP_NAME: `ProdCCWorkerService`,
              NEW_RELIC_LICENSE_KEY: '10520068371084329fa99ca2cfa6d532FFFFNRAL',
              REDIS_ENDPOINT: 'coolcatscache.zlifbx.ng.0001.use1.cache.amazonaws.com',
              REDIS_PORT: 6379,
              ZAPIER: 'https://hooks.zapier.com/hooks/catch/11988897/bkp2w8d/',
          },
      'dev': {
              AWS_REGION: 'us-east-1',
              SCAN_CONTRACTS: true,
              AWS_DATABASE_SECRET_NAME: 'CoolCatsSandbox',
              AWS_SYSTEM_WALLET_SECRET_NAME: 'SystemWallet',
              AWS_PUSHER_CREDENTIALS_NAME: 'PusherDev',
              AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/worker_api_dev.fifo',
              AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: 'beta-coolpets-private',
              AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: 'dev-metadata.coolcatsnft.com',
              AWS_CLOUDFRONT_DISTRIBUTION: 'E11AOMHOV65XJF',
              MODE: EMode.DEV,
              DB_CREDENTIALS: '{"username": "devuser", "password": "Fried769Batter36watch", "engine": "mysql", "host": "127.0.0.1", "port": 3333, "dbname": "coolcatsmysqldev", "dbClusterIdentifier": "coolcats-prod-2"}',
              SYSTEM_ACCOUNT: '{"publicAddress": "0x772B92a6AbE5129F8Ef91D164Cc757dd9BbD0BC7", "privateKey": "0x89a3b486e026e89b8f99113e359a09da815121efc4752900fec0913eacdc9376"}',
              PUSHER_CREDENTIALS: '{"cluster":"mt1","appId":"1289161","secret":"e1471a5d7f81a7bc1c09","key":"e7dd63b00e26caac1a9f"}',
              OPENSEA_API_KEY: 'dcda06ee1b114760bf3a934d0990eec0',
              OPENSEA_ENDPOINT: 'https://testnets-api.opensea.io/',
              NEW_RELIC_APP_NAME: `DevCCWorkerService`,
              NEW_RELIC_LICENSE_KEY: '10520068371084329fa99ca2cfa6d532FFFFNRAL',
              REDIS_ENDPOINT: 'coolcatscache.zlifbx.ng.0001.use1.cache.amazonaws.com',
              REDIS_PORT: 6379,
              ZAPIER: 'https://hooks.zapier.com/hooks/catch/11988897/bfo8nem/',
        },
      'beta': {
              AWS_REGION: 'us-east-1',
              SCAN_CONTRACTS: true,
              AWS_DATABASE_SECRET_NAME: 'CoolCatsBeta',
              AWS_SYSTEM_WALLET_SECRET_NAME: 'SystemWallet',
              AWS_PUSHER_CREDENTIALS_NAME: 'PusherDev',
              AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/worker_api_beta.fifo',
              AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: 'beta-coolpets-private',
              AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: 'beta-metadata.coolcatsnft.com',
              AWS_CLOUDFRONT_DISTRIBUTION: 'E11AOMHOV65XJF',
              MODE: EMode.BETA,
              DB_CREDENTIALS: '{"username": "betauser", "password": "Fried769Batter36watch", "engine": "mysql", "host": "127.0.0.1", "port": 3335, "dbname": "coolcatsmysqlbeta", "dbClusterIdentifier": "coolcats-beta-2"}',
              SYSTEM_ACCOUNT: '{"publicAddress": "0xA860ec375839D7C0Bce3aE7ba75C2Bbd0d2F8808", "privateKey": "08104363183f4da873aad34c8300fd02bac2acd2684792932520a58deb466cab"}',
              PUSHER_CREDENTIALS: '{"appId": "1310679", "key": "e544a52f37920d89a779", "secret": "22833a1fd34fe6315a36", "cluster": "mt1"}',
              OPENSEA_API_KEY: 'dcda06ee1b114760bf3a934d0990eec0',
              OPENSEA_ENDPOINT: 'https://testnets-api.opensea.io/',
              NEW_RELIC_APP_NAME: `BetaCCWorkerService`,
              NEW_RELIC_LICENSE_KEY: '10520068371084329fa99ca2cfa6d532FFFFNRAL',
              REDIS_ENDPOINT: 'coolcatscache.zlifbx.ng.0001.use1.cache.amazonaws.com',
              REDIS_PORT: 6379,
              ZAPIER: 'https://hooks.zapier.com/hooks/catch/11988897/bfo8nem/',
          },
      'stage': {
          AWS_REGION: 'us-east-1',
          SCAN_CONTRACTS: true,
          AWS_DATABASE_SECRET_NAME: 'CoolCatsStage',
          AWS_SYSTEM_WALLET_SECRET_NAME: 'SystemWallet',
          AWS_PUSHER_CREDENTIALS_NAME: 'PusherStage',
          AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/worker_api_stage.fifo',
          AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: 'stage-coolpets-private',
          AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: 'stage-metadata.coolcatsnft.com',
          AWS_CLOUDFRONT_DISTRIBUTION: 'EOZ9FTUF6X8ZN',
          MODE: EMode.STAGE,
          DB_CREDENTIALS: '{"username": "stageuser", "password": "Fried769Batter36watch", "engine": "mysql", "host": "127.0.0.1", "port": 3339, "dbname": "coolcatsmysqlstage", "dbClusterIdentifier": "coolcats-stage-2"}',
          SYSTEM_ACCOUNT: '{"publicAddress": "0xbc9Ac18eA3B24fDFf0a63Bd7Cb9DFd5469c199dA", "privateKey": "0x5b563633c2c2f43fae8f7b195c0ae92ffd250ad3eab60621a91b99cec016a144"}',
          PUSHER_CREDENTIALS: '{"appId": "1289162", "key": "23f91319ce25478631b9", "secret": "d7c2e1fe848c6fc4d6a7", "cluster": "mt1"}',
          OPENSEA_API_KEY: 'dcda06ee1b114760bf3a934d0990eec0',
          OPENSEA_ENDPOINT: 'https://api.opensea.io/',
          NEW_RELIC_APP_NAME: `StageCCWorkerService`,
          NEW_RELIC_LICENSE_KEY: '10520068371084329fa99ca2cfa6d532FFFFNRAL',
          REDIS_ENDPOINT: 'coolcatscache.zlifbx.ng.0001.use1.cache.amazonaws.com',
          REDIS_PORT: 6379,
          ZAPIER: 'https://hooks.zapier.com/hooks/catch/11988897/bfo8nem/',
        },
      'sand': {
          AWS_REGION: 'us-east-1',
          SCAN_CONTRACTS: false,
          AWS_DATABASE_SECRET_NAME: 'CoolCatsSandbox',
          AWS_SYSTEM_WALLET_SECRET_NAME: 'SystemWallet',
          AWS_PUSHER_CREDENTIALS_NAME: 'PusherDev',
          AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/coolcats-sandbox.fifo',
          // TODO This is for testing (set corresponding value in nestJS server)
          // AWS_SQS_URL: 'https://sqs.us-east-1.amazonaws.com/683746102303/coolcats-test.fifo',
          AWS_S3_PRIVATE_PET_METADATA_IMAGE_BUCKET: 'beta-coolpets-private',
          AWS_S3_PUBLIC_PET_METADATA_IMAGE_BUCKET: 'dev-metadata.coolcatsnft.com',
          AWS_CLOUDFRONT_DISTRIBUTION: 'E11AOMHOV65XJF',
          MODE: EMode.SANDBOX,
          DB_CREDENTIALS: '{"username": "admin", "password": "<fried769Batter36watch>", "engine": "mysql", "host": "coolcatssandbox.crobbjmyg2pc.us-east-1.rds.amazonaws.com", "port": 3306, "dbname": "coolcats", "dbClusterIdentifier": "coolcats-prod-2"}',
          SYSTEM_ACCOUNT: '{"publicAddress": "0x772B92a6AbE5129F8Ef91D164Cc757dd9BbD0BC7", "privateKey": "0x89a3b486e026e89b8f99113e359a09da815121efc4752900fec0913eacdc9376"}',
          PUSHER_CREDENTIALS: '{"appId": "1310735", "key": "38c82b8dba4ab953c38b", "secret": "c8bbabb1e79a58f74578", "cluster": "mt1"}',
          OPENSEA_API_KEY: 'dcda06ee1b114760bf3a934d0990eec0',
          OPENSEA_ENDPOINT: 'https://testnets-api.opensea.io/',
          NEW_RELIC_APP_NAME: `SandboxCCWorkerService`,
          NEW_RELIC_LICENSE_KEY: '10520068371084329fa99ca2cfa6d532FFFFNRAL',
          REDIS_ENDPOINT: 'coolcatscache.zlifbx.ng.0001.use1.cache.amazonaws.com',
          REDIS_PORT: 6379,
          ZAPIER: 'https://hooks.zapier.com/hooks/catch/11988897/bfo8nem/',
        },
    };

    // SQS TEST: https://sqs.us-east-1.amazonaws.com/683746102303/coolcats-test.fifo
    // SQS SAND: https://sqs.us-east-1.amazonaws.com/683746102303/coolcats-sandbox.fifo

    /**
     * Default environment 20314400 19632470 20311162
     */
    public static env: any = { };

    public static merge(modeIn?: string): void {
        let mode: string;
        if (modeIn) {
            mode = modeIn;
        } else {
            mode = process.env?.MODE ? process.env?.MODE : 'sand';
        }
        process.env.MODE = mode;
        Environment.env = Environment.environments[mode];
        Environment.env = {...Environment.env, ...process.env};
    }
}
