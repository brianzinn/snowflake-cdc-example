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
 *
 * NOTE: If you fall behind, you will get this error:
 * zongji error: Error: ER_MASTER_FATAL_ERROR_READING_BINLOG: Could not find first log file name in binary log index file
 * This means you fell behind and your binlog position has been removed (SHOW BINLOGS will no longer have your checkpoint position file).
 */
export const getBinlogBatch = async (connection: Connection, binlogName: string, binlogNextPos: number, tablesToMonitor: string[], databaseName: string, minimumDurationInDeconds: number, maximumDurationInSeconds: number): Promise<BatchResults> => {
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
    const MIN_DURATION_MILLIS = minimumDurationInDeconds * 1000;
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

        const duration = curTimeMillis - startTimeMillis;
        const overTime = (eventTimestamp === undefined) || (duration > MAX_DURATION_MILLIS);
        const reachedMinimumTimeWithEvent = (eventTimestamp !== undefined) && (duration > MIN_DURATION_MILLIS);
        if ((overTime || caughtUp || reachedMinimumTimeWithEvent) && !shuttingDown) {
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

    // This will always be called first (since it is added first), but it is not a safe operation to move the trigger independently
    // instance.addTrigger({
    // 	name: 'position-watcher',
    // 	expression: `${databaseName}.*`,
    // 	statement: MySQLEvents.STATEMENTS.ALL,
    // 	onEvent: (event) => {
    // 		...
    // 	}
    // })

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

          // NOTE: it does not happen that the event has same position as the checkpoint, so binlog appears to start after the saved checkpoint and
          //       we do not need to prevent duplicate events here by ignoring.
          lastPosition.name = event.binlogName;
          lastPosition.position = event.nextPosition;
          await checkFinish(event.timestamp);
        },
      });
    })

    instance.on(MySQLEvents.EVENTS.BINLOG, (...data: any[]) => {
      if (Array.isArray(data) && data.length === 1) {
        const firstArg = data[0];
        if (firstArg.position && firstArg.binlogName && firstArg.position !== lastPosition.position && firstArg.binlogName !== lastPosition.name) {
          // ZongJi binlog Rotate event (https://github.com/rodrigogs/zongji/blob/master/lib/binlog_event.js#L35)
          // We may receive no table row events in our maximumDurationInSeconds second window and we don't want to re-process binlogs with no row events.
          // ALSO, we can get STUCK indefinitely when we are catching up and no table events occur in `maximumDurationInSeconds` seconds.
          // TODO: find a way to get the last binlog event, meanwhile this ensures we advance (generally 2-4 binlog rotates/30 seconds, but some take > 45 seconds).
          lastPosition.name = data[0].binlogName;
          lastPosition.position = data[0].position;
          console.log(`binlog rotate: ${JSON.stringify(lastPosition)}.`);
        }
      }
    });
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