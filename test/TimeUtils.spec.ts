import assert from 'assert';
import { yyyymmddPathFormat } from "../src/timeUtils";

describe(' > TimeUtils', () => {
	it('Fixed date should be yyyy/MM/dd', async () => {
		const date = yyyymmddPathFormat(new Date(2020, 9 /* zero-based */, 22), '/');
		assert.strictEqual(date, '2020/10/22');
	});
});