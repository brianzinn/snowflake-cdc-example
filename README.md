# snowflake-cdc-example
Serverless change data capture (CDC) to Snowflake via snowpipe in Node (basic example)

# Purpose
I didn't set out to write my own ingest into Snowflake.  I am using stitchdata to replicate tables into Snowflake, but they do not support a historical CDC (ie: they do REPLACE into on primary key and do not support COPY into and it is not on their roadmap).  Snowflake has table primary keys, but they serve only as metadata and are not enforced.  Stitch support suggested creating a view (which does not have the primary key limitation their system imposes), but with their incremental update I would lose changes (ie: multiple row updates between stitch intervals), so wanted to stick with binlog.

The other purpose is maybe it will help somebody else, since there is no official Nodejs support from Snowflake for snowpipe (they only have Python and Java SDKs at time of writing).  Also, this can run locally or quite cheap serverless, so no need to pay for a service if you wanted to build out your own.  I run a table priming to grab all data before running the CDC using essentially the same code (just an ordered SELECT statement instead of binlog) to populate table and then run this binlog (you can setup your pipe to replace or copy).

# Design
The CDC binlog reader will read it's last known state, if available, and start from there.  I have written some CQRS-like systems that take data changes from external systems and produce domain events, so the idea was to get all data changes into our data warehouse where we could build advanced BI reporting for system changes.  You simply choose a set of tables and push all row changes to Snowflake historical tables.

> How the pieces are connected (thanks to photopea - great image software!)
![Design Diagram](https://github.com/brianzinn/snowflake-cdc-example/raw/main/images/snowpipe-cdc-example.png)

To walk through what is happening - the first step is a cron scheduler - this example runs every 10 minutes.  Google cloud scheduler is easy to configure to call a cloud function (secure with an OIDC auth):
![Cloud Scheduler](https://github.com/brianzinn/snowflake-cdc-example/raw/main/images/cloud-scheduler.png)

The Cloud Scheduler triggers our function to start on a cron schedule.  The first step is to read through the Cloud SQL binlog and record all row level changes to the configured tables.  Then for *each* table it will do the following:
- create a .csv file of the new/updated row data
- save to a cloud storage bucket (in the Snowflake staging area used by the Snowflake pipe)
- call snowpipe API to notify with the file location and which pipe (not needed for auto-ingest)

If all API calls succeed then the binlog position advances and the next batch of updates will continue from current point in time.  Since this will be called going forward on a schedule then you need to make sure you don't fall behind (you call frequently enough and with enough iterations).

# Getting started
You just need to copy `.env.template` to `.env` and put in your values.  If you want to deploy to google cloud then to also copy `\environment\cdc.deploy.prod.yaml.template` to `\environment\cdc.deploy.prod.yaml`.  A fork of this will run as-is on production.

# Going further
For something production ready you should also use the API endpoint `loadHistoryScan` to make sure that your file was received and processed (snowpipe is not the friendliest API for verification as you cannot query by requestId or storage path, so it's clunky and chatty to work with - it only be queries by a date range).  I think they recognize that in their docs where they talk about rate limiting.  So, track each file upload and corresponding result.

# Testing locally
Google cloud functions are the same as expressjs handlers, so we can test locally.
If you are running your server locally - you can trigger via:
```bash
# linux
$ curl -d '{"checkpointName":"example"}' -H "Content-Type: application/json" -X POST http://localhost:9999/snowflakeCDC
# windows
curl -d "{\"checkpointName\":\"example\"}" -H "Content-Type: application/json" -X POST http://localhost:9999/snowflakeCDC
```

You can access the local server with `yarn start`, but if you have vscode the launch config for "Server debug" gives you breakpoints and variable inspection.