import { createSnowpipeAPI, SnowpipeAPI } from "snowflake-ingest-node";
import { getLatestSecret } from "./secretsManager";

/**
 * NOTE: snowflake-ingest-node uses built-in crypto.createPublicKey to generate fingerprint for authentication (only available node v12+).
 */
export const getSnowpipeAPI = async (): Promise<SnowpipeAPI> => {
	const {
		SNOWFLAKE_PRIVATE_KEY: privateKeyName,
		SNOWFLAKE_ACCOUNT: account,
		SNOWFLAKE_USERNAME: username,
		SNOWFLAKE_REGION_ID: regionId,
		SNOWFLAKE_CLOUD_PROVIDER: cloudProvider
	} = process.env;
	const privateKey = await getLatestSecret(privateKeyName);
	const result = createSnowpipeAPI(username, privateKey, account, regionId, cloudProvider, {
		recordHistory: true
	});
	return result;
};