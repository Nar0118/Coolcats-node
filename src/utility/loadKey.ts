/*
 * Copyright (c) 2022. Cool Cats Group LLC
 * ALL RIGHTS RESERVED
 * Author: Christopher Hassett
 */

import AWS, {SecretsManager} from 'aws-sdk';
import {Environment} from '../environment';
import {ethers} from 'ethers';
import {EthereumAccount, promisify} from './util';

type SecretValueResult = {
    SecretString?: string;
}

export class LoadKey {
    
    /**
     * Returns our system account key loaded from the AWS secrets manager according
     * to the stage we are on.
     */
    public static loadKeyFromAwsSecrets(): Promise<string> {
        const client: SecretsManager = new AWS.SecretsManager({
            region: Environment.env.AWS_REGION
        });
        const SecretId: string = LoadKey.secretNameFromStack(Environment.env.MODE);
        const params: SecretsManager.Types.GetSecretValueRequest = { SecretId };
        return promisify<SecretValueResult>(client, 'getSecretValue', params).then(result => {
            if (!result.SecretString) {
                throw new Error(`Missing Secret String for stack ${Environment.env.MODE}`);
            } else {
                return result.SecretString;
            }
        }).catch(err => {
            throw new Error(`Missing Secret String for stack ${Environment.env.MODE}`);
        });
    }
    
    /**
     * Synthesizes the system account secret name from the convention: <stack-key>_SYSTEM_ACCOUNT
     * which is what devops creates when they bring up a stack
     * @param stackName
     * @private
     */
    public static secretNameFromStack(stackName: string): string {
        return `${stackName.toUpperCase()}_SYSTEM_ACCOUNT`;
    }
}
