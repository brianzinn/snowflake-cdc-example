import MySQLEvents, { ZongjiOptions } from '@rodrigogs/mysql-events';
import { Connection } from 'mysql';

export type BinlogCheckpoint = {
	name?: string
	position?: number
}

export type BatchResults = {
	caughtUp: boolean
	changes: Record<string, any[]>
	lastTimestamp: number | undefined
	hasChanges: boolean,
	nextBinlog: BinlogCheckpoint
}

/**
 * The passed in connection will automatically be opened as well as closed.
 */
export const getBinlogBatch = async (connection: Connection, binlogName: string, binlogNextPos: number, tablesToMonitor: string[], databaseName: string, maximumDurationInSeconds: number): Promise<BatchResults> => {
	// https://github.com/rodrigogs/zongji#zongji-class
	const zongjiOptions: ZongjiOptions = {
		serverId: 2, // you need a unique ID for every binlog slave
		startAtEnd: true, // defaults to false
		binlogName,
		binlogNextPos,
		includeSchema: {
			[databaseName]: tablesToMonitor
		}
	}

	return new Promise<BatchResults>((resolve, reject) => {
		console.log('> starting batch with', JSON.stringify(zongjiOptions));
		const instance = new MySQLEvents(connection, zongjiOptions);

		const updates: Record<string, any[]> = {};
		const lastPosition: BinlogCheckpoint = {};

		const startTimeMillis = new Date().getTime()
		const MAX_DURATION_MILLIS = maximumDurationInSeconds * 1000;
		let shuttingDown = false;
		let caughtUp = false;
		let lastTimestamp: number | undefined;

		/**
		 * @param eventTimestamp always supplied when received from CDC trigger (undefined from timeout)
		 */
		const checkFinish = async (eventTimestamp?: number) => {
			try {
				const curTimeMillis = new Date().getTime();

				if (eventTimestamp !== undefined) {
					lastTimestamp = eventTimestamp;
					const secondsAgoEvent = ((curTimeMillis - eventTimestamp) / 1000);
					// console.log(` > event at ${fullDateFormat(new Date(eventTimestamp))} --> ${secondsAgoEvent} seconds ago.`);
					caughtUp = secondsAgoEvent < 1; // we will miss other rows updated recently, but will be eventually consistent (this saves waiting at end of binlog each poll)
				}

				const overTime = (eventTimestamp === undefined) || (curTimeMillis - startTimeMillis > MAX_DURATION_MILLIS);
				if ((overTime || caughtUp) && !shuttingDown) {
					try {
						shuttingDown = true;
						if (eventTimestamp === undefined) {
							clearTimeout(checkFinishTimeoutHandle);
						}
						console.log(`finished:${caughtUp ? ' caught up' : ''}${overTime ? ' out of time' : ''}.`);
						// console.log('stopped at position:', lastPosition);

						tablesToMonitor.forEach(tableToMonitor => {
							instance.removeTrigger({
								name: `${tableToMonitor} table`,
								expression: `${databaseName}.${tableToMonitor}`,
								statement: MySQLEvents.STATEMENTS.ALL
							});
						})
						// this also ends the mysql connection:
						await instance.stop();
						// console.timeEnd("instance-time"); // prints twice in vscode (known bug)

						const changes: Record<string, any[]> = {};
						let hasChanges = false;
						tablesToMonitor.forEach(tableToMonitor => {
							const tableUpdates = updates[tableToMonitor];
							const tableChanges: any[] = tableUpdates.reduce((prev, cur) => {
								prev.push(...cur.affectedRows.map((row: any) => row.after));
								return prev;
							}, []);
							hasChanges = hasChanges || (tableChanges.length > 0);
							console.log(`> tracked ${tableChanges.length === 0 ? 'no' : tableChanges.length} changes in table '${tableToMonitor}'.`);
							// console.log(changes);
							changes[tableToMonitor] = tableChanges;
						})
						resolve({
							caughtUp,
							changes,
							hasChanges,
							nextBinlog: lastPosition,
							lastTimestamp
						});
					} catch (e) {
						console.error(e);
						reject(e);
					}
				}
			} catch (ex) {
				console.error(ex);
			}
		}

		tablesToMonitor.forEach(tableToMonitor => {
			updates[tableToMonitor] = [];
			instance.addTrigger({
				name: `${tableToMonitor} table`,
				expression: `${databaseName}.${tableToMonitor}`,
				statement: MySQLEvents.STATEMENTS.ALL,
				onEvent: async (event) => {
					if (event.type === 'UPDATE' || event.type === 'INSERT') {
						updates[tableToMonitor].push(event);
					} else {
						console.warn(`${tableToMonitor} unknown event:`, event.type);
					}

					lastPosition.name = event.binlogName;
					lastPosition.position = event.nextPosition;
					await checkFinish(event.timestamp);
				},
			});
		})

		instance.on(MySQLEvents.EVENTS.CONNECTION_ERROR, console.error);
		instance.on(MySQLEvents.EVENTS.ZONGJI_ERROR, (error) => {
			console.error('zongji error:', error);
		});

		// console.time("instance-time");
		(async () => {
			await instance.start();
			console.log(`> binlog CDC running (up to ${maximumDurationInSeconds} seconds).`);
		})();

		const checkFinishTimeoutHandle = setTimeout(() => {
			checkFinish();
		}, MAX_DURATION_MILLIS);
	})
}