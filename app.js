/* eslint-disable no-console */
const express = require('express');
const pg = require('pg');
const async = require('async');
const Prometheus = require('prom-client');
const http = require('http');

let dbClient = null;
let connectionString = '';

if (process.env.DATABASE_URL) {
  connectionString = process.env.DATABASE_URL;
} else {
  const connInfo = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    port: process.env.DB_PORT || 5432,
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAMES || 'bbz'
  };
  connectionString = `postgres://${connInfo.user}:${connInfo.password}@${connInfo.host}:${connInfo.port}/${connInfo.database}`;
}
var pool = new pg.Pool({
  connectionString: connectionString
});

async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client) {
      if (err) {
        console.error('Waiting for database');
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error('Giving up');
    }
    console.log('Connected to db');
    onDbConnected(client);
  }
);

function onDbConnected(client) {
  dbClient = client;
  dbClient.query('SELECT COUNT(1) as count FROM news', [], function(err, result) {
    if (err) {
      console.error('Error performing query: ' + err);
    } else {
      console.log(`${result.rows[0].count} news into database.`);
    }
  });
}

const httpRequestDurationMicroseconds = new Prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'path', 'status_code', 'mode'],
  // buckets for response time from 0.1ms to 500ms
  buckets: [0.10, 5, 15, 50, 100, 200, 300, 400, 500]
});
const app = express();

app.set('view engine', 'pug');
app.use(express.static(__dirname + '/static'));
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  next();
});
// Runs before each requests
app.use((req, res, next) => {
  res.locals.startEpoch = Date.now();
  next();
});

function resolveImages() {
  const mode = process.env.MODE || 'high';
  let images = [];

  if (mode === 'high') {
    images = ['/images/high-3.jpg', '/images/high-12.jpg', '/images/high-15.jpg'];
  } else if (mode === 'low') {
    images = ['/images/low-3.jpg', '/images/low-12.jpg', '/images/low-15.jpg'];
  }
  return images;
}

function register(req, res, status) {
  const responseTimeInMs = Date.now() - res.locals.startEpoch;
  httpRequestDurationMicroseconds
    .labels(req.method, req.route.path, status, process.env.MODE)
    .observe(responseTimeInMs);
}

app.get('/news', function (req, res) {
  dbClient.query('SELECT id, title, body, tags FROM news ORDER BY RANDOM() LIMIT 20', [], function(err, result) {
    if (err) {
      console.log(err);
      register(req, res, 500);
      res.status(500).send();
    } else {
      register(req, res, 200);
      res.render('news', {news: result.rows, mode: process.env.MODE});
    }
  });
});

app.get('/details/:id', function (req, res) {
  dbClient.query(`SELECT id, title, body, tags FROM news where id = ${req.params.id} limit 1`, [], function(err, result) {
    if (err) {
      console.log(err);
      register(req, res, 500);
      res.status(500).send();
    } else {
      register(req, res, 200);
      res.render('details', {model: result.rows[0], images: resolveImages(), mode: process.env.MODE});
    }
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
});

const server = http.Server(app);
const port = process.env.PORT || 4000;
server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
