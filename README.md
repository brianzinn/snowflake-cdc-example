# snowflake-cdc-example
Serverless change data capture (CDC) to Snowflake via snowpipe in Node (basic example)

# Purpose
I didn't set out to write my own ingest into Snowflake.  I am using stitchdata to replicate tables into Snowflake, but they do not support a historical CDC (ie: they do REPLACE into on primary key and do not support COPY into and it is not on their roadmap).  Snowflake has table primary keys, but they serve only as metadata and are not enforced.  Stitch support suggested creating a view (which does not have the primary key limitation their system imposes), but with their incremental update I would lose changes (ie: multiple row updates between stitch intervals), so wanted to stick with binlog.

The other purpose is maybe it will help somebody else, since there is no official Nodejs support from Snowflake for snowpipe (they only have Python and Java SDKs at time of writing).  Also, this can run locally or quite cheap serverless.

# Design
The CDC binlog reader will read it's last known state, if available, and start from there.  I have written some CQRS-like systems that take data changes from external systems and produce domain events, so the idea was to get all data changes into our data warehouse where we could build advanced BI reporting around data changes.  The idea is that you choose a set of tables and push all row changes to Snowflake historical tables (with cloud storage and Snowflake pipes).

# Testing locally
Google cloud functions are the same as expressjs handlers, so we can test locally.
If you are running your server locally - you can trigger via:

You can access the local server with `yarn start`, but if you have vscode the launch config for "Server debug" gives you breakpoints and variable inspection:
```bash
# linux
$ curl -d '{"checkpointName":"example"}' -H "Content-Type: application/json" -X POST http://localhost:9999/snowflakeCDC
# windows
curl -d "{\"checkpointName\":\"example\"}" -H "Content-Type: application/json" -X POST http://localhost:9999/snowflakeCDC
```