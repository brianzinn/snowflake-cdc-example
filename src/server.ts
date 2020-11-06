import express, { Request, Response, NextFunction } from "express";
import bodyParser from 'body-parser';
import { snowflakeCDC } from '.';

const server = express();

// https://github.com/expressjs/body-parser#bodyparsertextoptions
// server.use(bodyParser.text({ defaultCharset: 'utf8', type: 'text/plain' }));
server.use(bodyParser.json({ type: 'application/json' }))

server.get("/snowflakeCDC", snowflakeCDC);
server.post("/snowflakeCDC", snowflakeCDC);

server.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (!err) {
    return next();
  }

  console.error(err);
  res.status(500);
  res.send('500: Internal server error');
});

const SERVER_PORT = 9999;
server.listen(SERVER_PORT, () =>
  console.log(`Function Server running on http://localhost:${SERVER_PORT}`)
);