import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Each fixture row is the call arguments plus the expected result as JSON.
export type FixtureRow = unknown[];

const fixtures = JSON.parse(
    readFileSync(new URL("../colors/parity-fixtures.json", import.meta.url), "utf8"),
) as Record<string, FixtureRow[] | undefined>;

export function fixtureRows(name: string): FixtureRow[] {
    const rows = fixtures[name];
    if (!rows)
        throw new Error(`missing fixture table: ${name}`);
    return rows;
}

export function asJson(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
}

export function cases(name: string, run: (row: FixtureRow) => unknown): void {
    for (const row of fixtureRows(name)) {
        const expected = row[row.length - 1];
        assert.deepEqual(asJson(run(row)), expected, `${name}: ${JSON.stringify(row)}`);
    }
}
