/* eslint-disable no-console */
const express = require('express')
const pg = require('pg')
const Prometheus = require('prom-client')
const http = require('http')
const fs = require('fs')

if (process.env.NODE_ENV != 'production') require('dotenv').config()

let pool

if (process.env.DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    config: { max: 500 }
  })
} else {
  pool = new pg.Pool({ config: { max: 500 } })
}

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

const httpRequestDurationMicroseconds = new Prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'path', 'status_code', 'mode'],
  // buckets for response time from 0.1ms to 500ms
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500]
})
const app = express()

app.set('view engine', 'pug')
app.use(express.static(__dirname + '/static'))
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  )
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS')
  next()
})
app.use((req, res, next) => {
  res.locals.startEpoch = Date.now()
  next()
})

const resolveImages = () => {
  return new Promise((resolve, reject) => {
    fs.readdir(`./static/images/${process.env.MODE}`, (err, files) => {
      if (err) reject(err)
      for (let i = files.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [files[i], files[j]] = [files[j], files[i]];
      }
      resolve(files.splice(0, 4).map(f => `/images/${process.env.MODE}/${f}`));
    })
  })
}

function register(req, res, status) {
  const responseTimeInMs = Date.now() - res.locals.startEpoch
  httpRequestDurationMicroseconds
    .labels(req.method, req.route.path, status, process.env.MODE)
    .observe(responseTimeInMs)
}

app.get('/news', async (req, res) => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT id, title, body, tags FROM news ORDER BY RANDOM() LIMIT 20'
    )
    register(req, res, 200)
    res.render('news', { news: result.rows, mode: process.env.MODE })
  } catch (err) {
    console.log(err)
    register(req, res, 500)
    res.status(500).send()
  } finally {
    client.release()
  }
})

app.get('/details/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT id, title, body, tags FROM news where id = $1 limit 1', [parseInt(req.params.id)])
    register(req, res, 200)
    const images = await resolveImages()
    res.render('details', {
      model: result.rows[0],
      images: images,
      mode: process.env.MODE
    })
  } catch (err) {
    console.log(err)
    register(req, res, 500)
    res.status(500).send()
  } finally {
    client.release()
  }
})

app.get('/metrics', (req, res) => {
  res.set('Content-Type', Prometheus.register.contentType);
  res.end(Prometheus.register.metrics());
})

pool.connect((err, client, done) => {
  if (err) throw err
  client.query('SELECT COUNT(1) as count FROM news', (err, result) => {
    done()
    if (err) {
      console.log(err.stack)
    } else {
      console.log(`${result.rows[0].count} news into database.`)
      start()
    }
  })
})

const start = () => {
  const server = http.Server(app)
  const port = process.env.PORT || 4000
  server.listen(port, () => {
    var port = server.address().port
    console.log('App running on port ' + port)
  })
}
