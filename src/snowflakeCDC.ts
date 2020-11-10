import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { BatchOrchestrationResult, processSingleBatch } from './binlogBatchOrchestrator';

dotenv.config();

/**
 * Performs the next step of the table prime.
 *
 * @param {!express:Request} req  Cloud Function HTTP request context.
 *                                More info: https://expressjs.com/en/api.html#req
 * @param {!express:Response} res HTTP response context.
 *                                More info: https://expressjs.com/en/api.html#res
 */
export const snowflakeCDC = async (req: Request, res: Response) => {
  // POSTed as application/json, so body is an Object (https://cloud.google.com/functions/docs/writing/http#sample_usage)
  const checkpointName = req.body?.checkpointName ?? 'example';

  if (checkpointName === undefined || checkpointName === '') {
    console.error('missing checkpoint name: ', req.body);
    res.status(400).send(`Missing checkpoint name: '${checkpointName}'`);
    return;
  }

  try {
    const binlogCheckpointName = 'example';
    const BATCH_MAX_DURATION_IN_SECONDS = 65;

    const DATABASE_NAME = process.env.DB_NAME;
    const tablesToMonitor: string[] = process.env.CDC_TABLES_CSV.split(','); // NOTE: don't uses spaces or trim here

    // NOTE: not using createPool() and release() on connections, because only called on a cron schedule
    const batchOrchestrationResult: BatchOrchestrationResult = await processSingleBatch(DATABASE_NAME, tablesToMonitor, binlogCheckpointName, BATCH_MAX_DURATION_IN_SECONDS);
    const results = [batchOrchestrationResult]
    // each HTTP endpoint call could call multiple times to catch up during burts of db activity.
    if (!batchOrchestrationResult.caughtUp && batchOrchestrationResult.hasChanges) {
      console.log('Processing a second batch (some catching up to do)...')
      const secondBatchOrchestrationResult: BatchOrchestrationResult = await processSingleBatch(DATABASE_NAME, tablesToMonitor, binlogCheckpointName, BATCH_MAX_DURATION_IN_SECONDS);
      results.push(secondBatchOrchestrationResult);
    }

    res.status(200).send(results);
  } catch (e) {
    console.error("error processing snowflake CDC.")
    console.error(e);
    res.status(500).send('Internal Server Error');
  }
}