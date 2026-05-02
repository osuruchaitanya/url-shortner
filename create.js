/**
 * Lambda: POST /links
 * Creates a new short URL entry in DynamoDB.
 *
 * Request body (JSON):
 *   { target_url, custom_code?, ttl_seconds? }
 *
 * Response:
 *   { code, short_url, target_url, created_at }
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');

const dynamo   = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE    = process.env.LINKS_TABLE  || 'url-shortener-links';
const BASE_URL = process.env.BASE_URL     || 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod';
const CODE_LEN = parseInt(process.env.CODE_LENGTH || '6');
const MAX_TTL  = parseInt(process.env.MAX_TTL_SECONDS || String(365 * 24 * 3600));

// Safe characters — no lookalike chars (0, O, I, l, 1)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/* ── Helpers ──────────────────────────────────────── */

function generateCode(len = CODE_LEN) {
  const buf = crypto.randomBytes(len * 2);
  return Array.from(
    { length: len },
    (_, i) => ALPHABET[buf[i] % ALPHABET.length]
  ).join('');
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function isValidCode(code) {
  return /^[a-zA-Z0-9_-]{2,24}$/.test(code);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
    body: JSON.stringify(body),
  };
}

/* ── Check if code already exists ─────────────────── */
async function codeExists(code) {
  const res = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: marshall({ code }),
    ProjectionExpression: 'code',
  }));
  return !!res.Item;
}

/* ── Handler ──────────────────────────────────────── */
exports.handler = async (event) => {
  console.log('create-link event:', JSON.stringify({
    path: event.path,
    method: event.httpMethod,
  }));

  /* Parse body */
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON body' });
  }

  const { target_url, custom_code, ttl_seconds } = body;

  /* Validate target URL */
  if (!target_url || typeof target_url !== 'string') {
    return response(400, { error: '`target_url` is required' });
  }
  const cleanUrl = target_url.trim();
  if (!isValidUrl(cleanUrl)) {
    return response(400, {
      error: '`target_url` must be a valid http or https URL',
    });
  }

  /* Validate / generate code */
  let code;
  if (custom_code) {
    const clean = custom_code.trim().toLowerCase();
    if (!isValidCode(clean)) {
      return response(400, {
        error: '`custom_code` must be 2–24 characters: letters, digits, hyphens, underscores only',
      });
    }
    if (await codeExists(clean)) {
      return response(409, { error: `Code '${clean}' is already taken` });
    }
    code = clean;
  } else {
    // Generate unique code — retry up to 5 times on collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      if (!(await codeExists(candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return response(500, { error: 'Could not generate a unique code, please retry' });
    }
  }

  /* Build DynamoDB item */
  const now = Date.now();
  const item = {
    code,
    target_url:   cleanUrl,
    created_at:   now,
    click_count:  0,
    created_at_day: new Date(now).toISOString().slice(0, 10),
  };

  /* Handle TTL */
  if (ttl_seconds) {
    const ttl = Math.min(parseInt(ttl_seconds) || 0, MAX_TTL);
    if (ttl > 0) {
      item.expires_at    = Math.floor(now / 1000) + ttl; // seconds — DynamoDB TTL
      item.expires_at_ms = now + ttl * 1000;             // ms — for API response
    }
  }

  /* Write to DynamoDB */
  try {
    await dynamo.send(new PutItemCommand({
      TableName: TABLE,
      Item: marshall(item),
      ConditionExpression: 'attribute_not_exists(code)', // safety guard
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'Code collision, please retry' });
    }
    console.error('DynamoDB PutItem error:', err);
    return response(500, { error: 'Failed to save link' });
  }

  const short_url = `${BASE_URL}/${code}`;
  console.log(`Created: ${code} → ${cleanUrl}`);

  return response(201, {
    code,
    short_url,
    target_url:  cleanUrl,
    created_at:  now,
    expires_at:  item.expires_at_ms || null,
  });
};

