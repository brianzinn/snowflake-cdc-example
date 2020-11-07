import { Connection } from "mysql";
import { InsertFileResponse, SnowpipeAPIResponse } from "snowflake-ingest-node";
import { convertToCsv } from "./csvConverter";
import { CheckpointRow, endConnection, getBinlogCheckpoint, getConnection, setBinlogCheckpointCounter } from "./DatabaseConnector";
import { BinlogCheckpoint, getBinlogBatch } from "./getBinlogBatch";
import { getSnowpipeAPI } from "./snowpipeAPI";
import { CloudFile, storeToBucket } from "./storeFileToBucket";
import { yyyymmddPathFormat } from "./TimeUtils";
import { Nullable } from "./types";

export type BatchOrchestrationResult = {
	caughtUp: boolean
	hasChanges: boolean
}

const PATH_SEPARATOR = '/';

export const processSingleBatch = async (databaseName: string, tablesToMonitor: string[], binlogCheckpointName: string, maxDurationInSeconds: number): Promise<BatchOrchestrationResult> => {
	const batchOrchestrationResult: BatchOrchestrationResult = {
		caughtUp: true,
		hasChanges: true
	};

	const snowpipeAPI = await getSnowpipeAPI();

	const connection: Connection = await getConnection();

	const updateNextCheckpoint = async (checkpointName: string, nextBinlog: BinlogCheckpoint, checkpoint: CheckpointRow) => {
		if (nextBinlog.name === undefined || nextBinlog.position === undefined) {
			console.error(`Next binlog has missing properties: ${JSON.stringify(nextBinlog)}`);
			return;
		}

		if (checkpoint.binlogName === nextBinlog.name && checkpoint.binlogPosition === nextBinlog.position) {
			console.error('Next binlog checkpoint has not moved (this can happen with short run intervals and no table events.');
			return;
		}

		const succeeded = await setBinlogCheckpointCounter(connection, checkpointName, nextBinlog.name, nextBinlog.position);
		if (succeeded) {
			console.log(`Successfully advanced binlog checkpoint from ${JSON.stringify(checkpoint)} to new position '${nextBinlog.name}' -> ${nextBinlog.position}`)
		} else {
			console.error('Failed to advance checkpoint counter');
		}
	}

	try {
		const checkpoint = await getBinlogCheckpoint(connection, binlogCheckpointName);
		console.log('checkpoint is:', checkpoint);

		const batchResults = await getBinlogBatch(connection, checkpoint.binlogName, checkpoint.binlogPosition, tablesToMonitor, databaseName, maxDurationInSeconds);
		const { nextBinlog, changes, lastTimestamp } = batchResults;
		batchOrchestrationResult.hasChanges = batchResults.hasChanges;
		batchOrchestrationResult.caughtUp = batchResults.caughtUp;

		if (batchOrchestrationResult.hasChanges) {
			// NOTE: that snowflake doesn't let you know if there are downstream errors via permissions/misconfiguration, but you can see in
			// the history scan and fix/retry.  It is outside of a simple example to track all insert and verify via history scan (limited API only by date).
			let allApiCallsAcknowledged: boolean | undefined;
			for (const tableToMonitor of tablesToMonitor) {
				console.log(`Table : '${tableToMonitor}'`)
				const tableChanges = changes[tableToMonitor];
				if (tableChanges.length === 0) {
					console.log(`> no changes detected on '${tableToMonitor}' table.`)
				} else {
					const csvContents = convertToCsv(tableChanges, tableToMonitor);

					// assumes you want to partition your bucket by table name and then by dates.  This is useful for loading updates in a date range from a snowflake stage.
					const datePathPart = yyyymmddPathFormat(new Date(lastTimestamp), PATH_SEPARATOR);
					const path = [tableToMonitor, datePathPart].join(PATH_SEPARATOR);
					const filename = `binlog-${binlogCheckpointName}-${nextBinlog.name}-${nextBinlog.position}.csv`;
					let cloudFile: CloudFile;
					cloudFile = await storeToBucket(path, filename, csvContents);
					console.log(`> stored file: '${cloudFile.path}' in bucket '${cloudFile.bucket}' (new: ${!cloudFile.exists})`);

					// Case-sensitive, fully-qualified pipe name. For example, myDatabase.mySchema.myPipe.
					// pattern is ie: DATABASE.SCHEMA.PREFIX_<TABLENAME>_PIPE
					const pipeName = process.env.PIPE_TABLE_CONVENTION_PATTERN.replace('<TABLENAME>', tableToMonitor.toUpperCase());
					console.log('> saving to pipe:', pipeName);
					let lastCallAcknowledged = false;
					try {
						const response: Nullable<SnowpipeAPIResponse<InsertFileResponse>> = await snowpipeAPI.insertFile(pipeName, [`${datePathPart}${PATH_SEPARATOR}${cloudFile.filename}`]);
						lastCallAcknowledged = response.statusCode === 200 && response.json?.responseCode === 'SUCCESS';
						console.log('> snowpipe acknowledgement');
					} catch (e) {
						console.error('Error calling snowflake:', e);
					}

					allApiCallsAcknowledged = (allApiCallsAcknowledged === undefined) ? lastCallAcknowledged : (allApiCallsAcknowledged && lastCallAcknowledged);
				}
			}

			if (allApiCallsAcknowledged === true) {
				// console.log('All api calls succeeded - bumping checkpoint');
				await updateNextCheckpoint('example', nextBinlog, checkpoint);
			}
		} else {
			console.log('No data changes detected.');
			await updateNextCheckpoint('example', nextBinlog, checkpoint);
		}
	} catch (e) {
		console.error(e);
		throw e;
	} finally {
		await endConnection(connection);
	}
	return batchOrchestrationResult;
}