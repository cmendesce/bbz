/* eslint-disable no-console */
const express = require('express');
const mysql = require('mysql');
const async = require('async');
const Prometheus = require('prom-client');
const http = require('http');

let dbConnection = null;

async.retry(
  {times: 1000, interval: 1000},
  function (callback) {
    const connection = mysql.createConnection({
      host: 'localhost',
      user: 'znn',
      password: 'znn_pass',
      database: 'znn_data'
    });
    connection.connect(function(err) {
      if (err) {
        console.error('Waiting for db');
      }
      callback(err, connection);
    });
  },
  function (err, connection) {
    if (err) {
      return console.error('Giving up');
    }
    console.log('Connected to db');
    dbConnected(connection);
  }
);

function dbConnected(connection) {
  dbConnection = connection;
  connection.query('SELECT COUNT(1) as count FROM news', function(error, results) {
    console.log(`${results[0].count} news into database.`);
  });
}

const httpRequestDurationMicroseconds = new Prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'path', 'status_code'],
  // buckets for response time from 0.1ms to 500ms
  buckets: [0.10, 5, 15, 50, 100, 200, 300, 400, 500]
});
const app = express();

app.set('view engine', 'pug');
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
app.use(express.static(__dirname + '/views'));

app.get('/news', function (req, res) {
  const responseTimeInMs = Date.now() - res.locals.startEpoch;
  httpRequestDurationMicroseconds
    .labels(req.method, req.route.path, res.statusCode)
    .observe(responseTimeInMs);

  dbConnection.query('SELECT id, title, body, tags FROM news ORDER BY RAND() LIMIT 20', function (error, results) {
    if (error) throw error;
    res.render('news', {news: results});
  });
});

app.get('/details/:id', function (req, res) {
  const responseTimeInMs = Date.now() - res.locals.startEpoch;
  httpRequestDurationMicroseconds
    .labels(req.method, req.route.path, res.statusCode)
    .observe(responseTimeInMs);

  dbConnection.query(`SELECT id, title, body, tags FROM news where id = ${req.params.id} limit 1`, function (error, results) {
    if (error) {
      throw error;
    }
    res.render('details', {
      result: results[0], mode: process.env.MODE
    });
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
