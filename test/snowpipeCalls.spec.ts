import * as dotenv from 'dotenv';

import { LoadHistoryScanResponse } from 'snowflake-ingest-node';
import { BatchOrchestrationResult, processSingleBatch } from '../src/BinlogBatchOrchestrator';
import { getSnowpipeAPI } from '../src/snowpipeAPI';

describe(' > Snowflake API harness', () => {

    // const sleep = (milliseconds: number) => {
    //     return new Promise(resolve => setTimeout(resolve, milliseconds))
    // }

    beforeEach(async () => {
        dotenv.config();
    });

    // There is a vscode launch config to debug this - it is the same logic as the cloud function (there is also a launch config for a local HTTP server) :)
    it.skip('process batches with debugger :)', async () => {
        const binlogCheckpointName = 'example';
        const BATCH_MAX_DURATION_IN_SECONDS = 30;

        const DATABASE_NAME = process.env.DB_NAME;
        const tablesToMonitor: string[] = process.env.CDC_TABLES_CSV.split(','); // NOTE: don't uses spaces or trim here
        let continueProcessing: boolean = true;
        let currentBatch = 0;

        while (continueProcessing) {
            currentBatch++;
            const batchOrchestrationResult: BatchOrchestrationResult = await processSingleBatch(DATABASE_NAME, tablesToMonitor, binlogCheckpointName, BATCH_MAX_DURATION_IN_SECONDS);
            // I am using google cloud scheduler to call on intervals.  So, can get behind.  One option is to add a cloud task here to get extra work done
            // We cannot work in parallel due to nature of binlog reading.
            // If you were writing a running process you would loop here and perhaps sleep if you were "caughtUp" or there were no updates "hasChanges === false".
            // (serverless can get a few loops in as well) and stay under 300 seconds.
            continueProcessing = batchOrchestrationResult.caughtUp === false && batchOrchestrationResult.hasChanges === true && currentBatch <= 3;
            console.log(`batch #${currentBatch} continuing ${continueProcessing} -> caught up: ${batchOrchestrationResult.caughtUp}.  has changes: ${batchOrchestrationResult.hasChanges}`);
        }
    });

    /**
     * This is how you see how your snowpipe loading is going.  If your files from storage aren't showing up in your tables then look here.
     * Example error is: Remote file 'https://<bucket-name>.storage.googleapis.com/<path>/<filename.csv>' was not found.
     * //                There are several potential causes. The file might not exist. The required credentials may be missing or invalid...
     */
    it.skip('loadHistoryScan', async () => {
        // start time is in ISO 8601 format zulu timezone.  Probably use a library like moment.tz.
        const snowpipeAPI = await getSnowpipeAPI();
        try {
            const pipeName = process.env.PIPE_TABLE_CONVENTION_PATTERN.replace('<TABLENAME>', 'ORDERLINE');
            const response = await snowpipeAPI.loadHistoryScan(pipeName, '2020-11-05T02:00:00.000Z');
            const responseObject: LoadHistoryScanResponse = response.json;
            console.log(responseObject);
        } catch (e) {
            console.error(e);
        }

        const endpointHistory = snowpipeAPI.endpointHistory;
        console.log(endpointHistory.loadHistoryScan[0].response.messageBody);
    })
});