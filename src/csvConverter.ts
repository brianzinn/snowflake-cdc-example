import Papa from 'papaparse';

export const convertToCsv = (rows: any[], tableName: string): string => {
    // NOTE: if you want your calls to snowflake to be resilient to db changes - you need to validate your rows here based on tableName.
    // ie: new Column then `delete row[...][columnName]` or missing column then `row[...][columnName]` = defaultValue
    const csv = Papa.unparse(rows, {
        header: true,
        newline: '\n',
        quotes: true
    })
    return csv;
}