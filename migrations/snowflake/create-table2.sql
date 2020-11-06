-- Another snowflake table
CREATE TABLE "DATABASE"."SCHEMA"."TABLE2" (
    code varchar(32) NOT NULL DEFAULT '',
    ...
    PRIMARY KEY (code) -- not enforced by snowflake!! just a metadata hint
);