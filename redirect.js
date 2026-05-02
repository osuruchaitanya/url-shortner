/**
 * Lambda: GET /{code}
 * Resolves a short code to its target URL, issues a 301 redirect,
 * and atomically increments click_count in DynamoDB.
 *
 * Also appends a minimal click log record (optional second table).
 */

const { DynamoDBClient, UpdateItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

const dynamo    = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE     = process.env.LINKS_TABLE  || 'url-shortener-links';
const LOG_TABLE = process.env.LOGS_TABLE   || 'url-shortener-clicks';
const LOG_CLICKS = process.env.LOG_CLICKS !== 'false';

function response(statusCode, body = '', headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function getMeta(event) {
  const headers = event.headers || {};
  const ip =
    headers['x-forwarded-for']?.split(',')[0].trim() ||
    headers['X-Forwarded-For']?.split(',')[0].trim() ||
    event.requestContext?.identity?.sourceIp ||
    'unknown';
  const ua      = headers['user-agent'] || headers['User-Agent'] || '';
  const ref     = headers['referer']    || headers['Referer']    || '';
  const country = headers['CloudFront-Viewer-Country'] || '';
  return { ip, ua, ref, country };
}

async function incrementAndFetch(code) {
  const now = Math.floor(Date.now() / 1000);
  const res = await dynamo.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: marshall({ code }),
    ConditionExpression:
      'attribute_exists(#code) AND (attribute_not_exists(expires_at) OR expires_at > :now)',
    UpdateExpression: 'SET click_count = click_count + :one',
    ExpressionAttributeNames: { '#code': 'code' },
    ExpressionAttributeValues: marshall({ ':one': 1, ':now': now }),
    ReturnValues: 'ALL_NEW',
  }));
  return res.Attributes;
}

async function logClick(code, meta) {
  if (!LOG_CLICKS) return;
  const logItem = {
    pk: code,
    sk: `${Date.now()}#${Math.random().toString(36).slice(2, 7)}`,
    clicked_at: Date.now(),
    ip:      meta.ip,
    ua:      meta.ua.slice(0, 512),
    ref:     meta.ref.slice(0, 256),
    country: meta.country,
  };
  try {
    await dynamo.send(new PutItemCommand({
      TableName: LOG_TABLE,
      Item: marshall(logItem),
    }));
  } catch (err) {
    console.warn('Click log write failed (non-fatal):', err.message);
  }
}

function notFoundHtml(code) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Link not found — snip.ly</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { font-family: monospace; background: #0a0a0a; color: #888;
         display: flex; flex-direction: column; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
  h1   { font-size: 3rem; color: #00ff88; margin-bottom: .5rem; }
  p    { font-size: .9rem; line-height: 2; }
  a    { color: #00ff88; }
</style></head><body>
<h1>404</h1>
<p>The short link <code style="color:#fff">/${escHtml(code)}</code> was not found or has expired.</p>
<p><a href="/">← Create a new link</a></p>
</body></html>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

exports.handler = async (event) => {
  const code = (event.pathParameters?.code || '').trim().toLowerCase();

  console.log('redirect event:', JSON.stringify({ code, path: event.path }));

  if (!code || !/^[a-zA-Z0-9_-]{2,24}$/.test(code)) {
    return response(400, '<p>Bad request</p>');
  }

  let attrs;
  try {
    attrs = await incrementAndFetch(code);
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`Code not found or expired: ${code}`);
      return response(404, notFoundHtml(code));
    }
    console.error('DynamoDB error:', err);
    return response(502, '<p>Service error, please try again</p>');
  }

  const { unmarshall } = require('@aws-sdk/util-dynamodb');
  const item      = unmarshall(attrs);
  const targetUrl = item.target_url;

  if (!targetUrl) {
    return response(404, notFoundHtml(code));
  }

  // Fire-and-forget — don't await, keep redirect fast
  logClick(code, getMeta(event)).catch(console.warn);

  console.log(`Redirecting: ${code} → ${targetUrl} (clicks: ${item.click_count})`);

  return response(301, '', {
    Location:        targetUrl,
    'Cache-Control': 'no-store, no-cache',
    'X-Click-Count': String(item.click_count),
  });
};

