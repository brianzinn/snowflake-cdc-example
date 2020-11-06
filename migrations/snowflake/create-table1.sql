-- This is the snowflake table.  Your pipe should redirect to here.
CREATE TABLE "DATABASE"."SCHEMA"."TABLE1" (
    code varchar(32) NOT NULL DEFAULT '',
    ...
    PRIMARY KEY (code) -- only metadata in Snowflake (not respected - allows historical data)
);