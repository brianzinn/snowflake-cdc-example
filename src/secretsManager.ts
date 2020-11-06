import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export const getLatestSecret = async (secretName: string): Promise<string> => {
    const client = new SecretManagerServiceClient();

    // https://cloud.google.com/secret-manager/docs/access-control (versions access required)
    const [version] = await client.accessSecretVersion({
        name: `projects/${process.env.GOOGLE_PROJECT_NUMERIC_ID}/secrets/${secretName}/versions/latest`
    });
    return (version.payload.data as any /* it's an ArrayBuffer */).toString('utf8');
}