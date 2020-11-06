-- You can create a table or go with something key/value nosql like MongoDb to store the checkpoints.
-- I went with mysql for example, since mysql is already part of solution.
CREATE TABLE snowflake_binlog_checkpoints (
    `name` varchar(32) NOT NULL,
    `binlog_name` varchar(24) DEFAULT NULL,
    `binlog_position` INT DEFAULT NULL,
    `update_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`name`)
)
ENGINE=InnoDB
COMMENT='snowflake binlog checkpoints'
;

INSERT INTO snowflake_binlog_checkpoints (name)
VALUES ('example');