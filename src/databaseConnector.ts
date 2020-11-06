import mysql, { Connection, ConnectionOptions, FieldPacket, OkPacket /*, RowDataPacket, ResultSetHeader */ } from 'mysql';
import { getLatestSecret } from './secretsManager';
import { Nullable } from './types';

export const getConnection = async (): Promise<Connection> => {
    const password: string = await getLatestSecret(process.env.DB_PASSWORD_KEY_SECRET)
    const options: ConnectionOptions = (process.env.CLOUD_SQL_CONNECTION_NAME !== undefined)
        ? {
            user: process.env.DB_USER,
            password,
            database: process.env.DB_NAME,
            // If connecting via unix domain socket, specify the path
            socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        } : {
            user: process.env.DB_USER,
            password: process.env.DB_PASS ?? password,
            database: process.env.DB_NAME,
            // If connecting via TCP, enter the IP and port instead
            host: process.env.DB_HOST,
            port: process.env.DB_PORT === undefined ? undefined : Number(process.env.DB_PORT),
            // debug: true,
            // ssl: {
            //     ca: fs.readFileSync(__dirname + '/certs/server-ca.pem'),
            //     key: fs.readFileSync(__dirname + '/certs/client-key.pem'),
            //     cert: fs.readFileSync(__dirname + '/certs/client-cert.pem')
            // }
        };

    return await mysql.createConnection(options);
}

export const connect = async (connection: Connection): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        connection.connect(err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    })
}

export const endConnection = async (connection: Connection): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        connection.end(err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        })
    })
}

type QueryResults<T> = {
    /**
     * Contains an OkPacket for single updates and row of objects for SELECT.
     */
    result: /* RowDataPacket[] | RowDataPacket[][] | OkPacket | OkPacket[] | ResultSetHeader |*/ T
    /**
     * Not supplied on OkPacket (UPDATE/INSERT)
     */
    fields?: FieldPacket[]
}

export const runQueryWithParameters = async <T>(connection: Connection, sql: string, parameterValues: (string | number)[]): Promise<QueryResults<T>> => {
    return new Promise<QueryResults<T>>((resolve, reject) => {
        connection.query(sql, parameterValues, (error, result, fields) => {
            if (error) {
                reject(error);
            };

            resolve({
                result: result as unknown as T, // hard cast
                fields
            });
        });
    });
}

/**
 * Logs an error if it could not detect that a single row was updated (not expecting upserts, which have different result type).
 * Gracefully continues, which in many cases is not the proper course of action.
 *
 * @param conn connection to run query
 * @param sql parameterized query
 * @param parameterValues values for query parameters
 */
export const executeSingleRowModifiedQuery = async (connection: Connection, sql: string, parameterValues: (string | number)[]): Promise<number | undefined> => {
    const response = await runQueryWithParameters<OkPacket>(connection, sql, parameterValues);

    if (response.result.affectedRows !== 1){
        console.error('Expected single row change.  Was:', JSON.stringify(response.result));
    }

    return response.result.affectedRows ;
}

type CheckpointRowDb = {
    binlog_name: string
    binlog_position: number | null
    update_date: Date
}

export type CheckpointRow = {
    binlogName: string
    binlogPosition: Nullable<number>
    updateDate: Date
}

export const getBinlogCheckpoint = async (connection: Connection, name: string): Promise<CheckpointRow> => {
    // can only be 1 or zero rows (table_name + checkpoint_type is PK)
    const sql = 'SELECT binlog_name, binlog_position, update_date FROM snowflake_binlog_checkpoints WHERE name=?;'
    const { result } = await runQueryWithParameters<CheckpointRowDb[]>(connection, sql, [
        name
    ]);

    if (!Array.isArray(result) || result.length !== 1) {
        throw new Error(`No checkpoint entry found for ${name}.  ${result?.length} rows`);
    }

    const dbRow = result[0] as any;

    return {
        binlogName: dbRow.binlog_name === null ? undefined : dbRow.binlog_name,
        binlogPosition: dbRow.binlog_position === null ? undefined : dbRow.binlog_position,
        updateDate: dbRow.update_date
    };
}

export const setBinlogCheckpointCounter = async (connection: Connection, checkpointName: string, binlogName: string, binlogPosition: number): Promise<boolean> => {
    const sql = `UPDATE snowflake_binlog_checkpoints SET binlog_name=?, binlog_position=? WHERE name=?;`;
    const parameterValues = [
        binlogName,
        binlogPosition,
        checkpointName,
    ];
    const rowsAffected = await executeSingleRowModifiedQuery(connection, sql, parameterValues);
    return rowsAffected === 1;
}
