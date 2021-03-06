import query from './sql-api'
const fs = require('fs')
const R = require('ramda')
import * as React from "react";
import * as ReactDOMServer from 'react-dom/server'
const path = require('path')

import changedTransactions from './changed-transactions'
import makeChangedAffiliates from './changed-affiliates'
import makeChangedHandles from './changed-handles'

const send = require('../send-api.js')

const trace = (x, y) => { console.log(x); return y }
const trace_ = x => trace(x, x)

const timeZoneOffset = -2

const dateFrom = new Date(new Date().valueOf() - 7 * 1000 * 3600 * 24 - timeZoneOffset * 1000 * 3600).toISOString().split('T')[0]
const dateTo    = new Date(new Date().valueOf() - timeZoneOffset * 1000 * 3600).toISOString().split('T')[0]
const yesterday = new Date(new Date().valueOf() - 1 * 1000 * 3600 * 24 - timeZoneOffset * 1000 * 3600).toISOString().split('T')[0]

const dateFromHourly = new Date(new Date().valueOf() - 7 * 1000 * 3600 * 24 - timeZoneOffset * 1000 * 3600)
const dateToHourly    = new Date(new Date().valueOf() - timeZoneOffset * 1000 * 3600)

const roundMinutes = date => {
    date.setHours(date.getHours() + Math.round(date.getMinutes()/60) - 1)
    date.setMinutes(0)
    date.setSeconds(0)
    return date.toISOString().replace(/(.*)\D\d+/, '$1').split('Z')[0]
}


const dateParams = {
  dateFrom: `${dateFrom}T00:00:00`,
  dateTo: `${dateTo}T00:00:00`,
  timeZoneOffset,
  frequency: 'daily'
}

const dateParamsHourly = {
  dateFrom: roundMinutes(dateFromHourly),
  dateTo: roundMinutes(dateToHourly),
  timeZoneOffset,
  frequency: 'hourly'
}
console.log(dateParamsHourly)

const changedAffiliatesParams = {
  ...dateParams,
  page: 'country_code',
  section: 'affiliate_id',
  filter: '' 
}

const changedHandlesParams = {
  ...dateParams,
  page: 'country_code',
  section: 'handle_name',
  filter: '' 
}

const changedTransactionsParams = {
  ...dateParams,
  page: 'country_code',
  section: 'gateway',
  filter: '' 
}

const changedAffiliatesParamsHourly = {
  ...dateParamsHourly,
  page: 'country_code',
  section: 'affiliate_id',
  filter: '' 
}

const write = fileName => x => new Promise((resolve, reject) => 
  { fs.writeFileSync(path.resolve(__dirname, fileName), x, 'utf8'); resolve(x); })

const getAffiliatesMap = () => query(process.env.jewel_connection_string, `select * from affiliate_mapping`, {})
  .then((x: {rows: [any]}) => x.rows)
  .then(R.pipe(
    R.map(x => [x.affiliate_id, x.affiliate_name])  
  , R.fromPairs
  , x => { x['null'] = 'Unknown'; return x }
  ))

const getGetHandleUrl = () => query(process.env.jewel_connection_string, `SELECT
      substring(p.landing_page_url, 0, charindex('?', p.landing_page_url)) as handle_url
    , p.handle as handle_name
    , p.country as country_code
    , count(*) as icount
    from pacman p WHERE  landing_page_url is not null 
      and creation_datetime > '$dateFrom$' 
      and creation_datetime < '$dateTo$' 
      and event_type = 'impression' 
    group by country_code, handle_name, handle_url
    order by country_code, handle_name, handle_url`, dateParams,
  )
  .catch(_ => require('../data/handles.json')) // fallback
  .then((x: {rows: [any]}) => x.rows)
  .then(R.sortBy(x => x.icount))
  .then(R.pipe(
    R.map(x => [`${x.country_code}$${x.handle_name}`, x.handle_url])
  , R.fromPairs
  , m => {
    return (country_code, handle_name) => m[`${country_code}$${handle_name}`] || null
  }
  ))


async function goDaily() {
  const affiliatesMap = await getAffiliatesMap()
  const getHandleUrl = await getGetHandleUrl()
  // const ChangedTransactions = await changedTransactions(changedTransactionsParams, {affiliatesMap})
  const { topAffiliates, changedCountries, changedAffiliates } = await makeChangedAffiliates(changedAffiliatesParams, {affiliatesMap})
  const { topHandles, changedHandles } = await makeChangedHandles(changedHandlesParams, {affiliatesMap, getHandleUrl})

  const Daily = <div style={ { 
        backgroundColor: 'white', color: 'black'
      , fontFamily: 'Osaka, CONSOLAS, Monaco, Courier, monospace, sans-serif'
      , fontSize: '14px'
      , maxWidth: '1200px'
      , margin: `1em 1em`} }>
      <h3>Daily Campaign Monitor - { yesterday } 
          <span style={ { fontSize: '80%', paddingLeft: '2em' }}> (
            <a style={ { color: 'black' } } href={ `http://sigma.sam-media.com/daily_reports_archive/${yesterday}/?username=sam-media&hash=37b90bce2765c2072c` }>view the full report online</a>)
            </span>
      </h3>
      { 
        [ changedCountries
        // , ChangedTransactions
        , changedAffiliates
        // , changedHandles
        , topAffiliates
        , topHandles].map(c => <div style={ { marginBottom: '3em', paddingBottom: '0.1em', borderBottom: 'solid 1px silver' } }>{ c }</div>)
      }
    </div>
      return ReactDOMServer.renderToStaticMarkup(Daily)
  // return ReactDOMServer.renderToString(Main)
}

async function goHourly() {
  const affiliatesMap = await getAffiliatesMap()
  const { topAffiliates, changedCountries, changedAffiliates } = await makeChangedAffiliates(changedAffiliatesParamsHourly, {affiliatesMap})
  const fileName = dateParamsHourly.dateTo + (timeZoneOffset > 0 ? '-' : '+') + Math.abs(timeZoneOffset)
  
  const subject = `Hourly Monitor - ${ dateParamsHourly.dateTo.replace('T', ' ') } UTC${ (timeZoneOffset > 0 ? '-' : '+') + Math.abs(timeZoneOffset) }` 

  const Hourly = <div style={ { 
     backgroundColor: 'white', color: 'black'
    , fontFamily: 'Osaka, CONSOLAS, Monaco, Courier, monospace, sans-serif'
    , fontSize: '14px'
    , maxWidth: '1200px'
    , margin: `1em 1em`} }>
    <h3>{ subject }
        <span style={ { fontSize: '80%', paddingLeft: '2em' }}> (
          <a style={ { color: 'black' } } href={ `http://sigma.sam-media.com/hourly_reports_archive/${fileName}/?username=sam-media&hash=37b90bce2765c2072c` }>view the full report online</a>)
          </span>
    </h3>
    { 
      [changedCountries, changedAffiliates, topAffiliates]
      .map(c => <div style={ { marginBottom: '3em', paddingBottom: '0.1em', borderBottom: 'solid 1px silver' } }>{ c }</div>)
    }
  </div>

  return { subject, content: ReactDOMServer.renderToStaticMarkup(Hourly), fileName }
}


if(process.env.daily ==="true"){
  goDaily()
// .then(trace_)
  .then(write('./../test.html'))
  .catch(console.error)
} else {
  const emails = R.pipe(
    R.split(',')
  , R.map(x => x.trim())
  )(fs.readFileSync('hourly-emails.txt', 'utf8'))
  goHourly()
  .then(({content, fileName, subject}) => write(`./../../gh-pages/hourly-archive/${fileName}.html`)(content).then(_ => ({content, subject})) )
  .then(({content, subject}) =>  send(subject, content, emails))
  .then(_ => console.log("done"))
  .catch(console.error)
}

