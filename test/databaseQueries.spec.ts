import assert from 'assert';
import * as dotenv from 'dotenv';
import { Connection } from 'mysql'

import { getBinlogCheckpoint, getConnection, endConnection, connect, setBinlogCheckpointCounter } from "../src/databaseConnector";

const useRealDatabase = true;

/**
 * These are not unit tests, but manual sanity tests on db queries
 */
describe.skip(' > Database queries against real db', () => {
    beforeEach(function beforeEach() {
        if (useRealDatabase) {
            dotenv.config();
        } else {
            dotenv.config({ path: './test/.env' });
        }
    });

    it('Get checkpoint', async () => {
        const connection: Connection = await getConnection();
        try {
            await connect(connection);
            const checkpoint = await getBinlogCheckpoint(connection, "example");

            // not doing deepEqual, because updateDate varies.
            assert.strictEqual('bin-test.123', checkpoint.binlogName);
            assert.strictEqual(123, checkpoint.binlogPosition);
            console.log('checkpoint is:', checkpoint);
        } finally {
            await endConnection(connection);
        }
    });

    it('Set checkpoint', async () => {
        const connection: Connection = await getConnection();
        try {
            await connect(connection);
            const succeeded = await setBinlogCheckpointCounter(connection, "example", "bin-test.123", 123);
            assert.ok(succeeded, 'expecting update to succeed (update 1 row)');
        } finally {
            await endConnection(connection);
        }
    })
});