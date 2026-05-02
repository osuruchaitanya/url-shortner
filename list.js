 javascript/**
 * Lambda: GET /admin/links
 * Returns all short links with click counts, sorted by clicks desc.
 *
 * Also handles:
 *   DELETE /links/{code}
 *   GET    /admin/links/{code}/stats
 *
 * Query params (GET /admin/links):
 *   ?limit=100        max items (default 100, max 1000)
 *   ?sort=clicks|date sort order (default: clicks desc)
 *   ?active=true      filter only non-expired links
 */

const {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
  QueryCommand,
} = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamo    = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE     = process.env.LINKS_TABLE || 'url-shortener-links';
const LOG_TABLE = process.env.LOGS_TABLE  || 'url-shortener-clicks';

function response(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
      ...extra,
    },
    body: JSON.stringify(body),
  };
}

/* ── GET /admin/links ──────────────────────────────── */
async function listLinks(event) {
  const qs         = event.queryStringParameters || {};
  const limit      = Math.min(parseInt(qs.limit || '100'), 1000);
  const sort       = qs.sort === 'date' ? 'date' : 'clicks';
  const activeOnly = qs.active === 'true';
  const now        = Math.floor(Date.now() / 1000);

  const scanParams = {
    TableName: TABLE,
    Limit: limit * 2,
    ...(activeOnly && {
      FilterExpression: 'attribute_not_exists(expires_at) OR expires_at > :now',
      ExpressionAttributeValues: marshall({ ':now': now }),
    }),
  };

  let items = [];
  let lastKey;

  do {
    if (lastKey) scanParams.ExclusiveStartKey = lastKey;
    const res  = await dynamo.send(new ScanCommand(scanParams));
    const page = (res.Items || []).map(i => {
      const item = unmarshall(i);
      return {
        code:        item.code,
        target_url:  item.target_url,
        click_count: item.click_count || 0,
        created_at:  item.created_at  || 0,
        expires_at:  item.expires_at_ms || null,
        is_expired:  item.expires_at ? item.expires_at < now : false,
      };
    });
    items.push(...page);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && items.length < limit);

  items = items.slice(0, limit);

  if (sort === 'date') {
    items.sort((a, b) => b.created_at - a.created_at);
  } else {
    items.sort((a, b) => b.click_count - a.click_count);
  }

  const totalClicks = items.reduce((s, l) => s + l.click_count, 0);
  const activeCount = items.filter(l => !l.is_expired).length;

  return response(200, {
    links:        items,
    total:        items.length,
    total_clicks: totalClicks,
    active_count: activeCount,
    generated_at: Date.now(),
  });
}

/* ── DELETE /links/{code} ──────────────────────────── */
async function deleteLink(code) {
  if (!code || !/^[a-zA-Z0-9_-]{2,24}$/.test(code)) {
    return response(400, { error: 'Invalid code' });
  }

  try {
    await dynamo.send(new DeleteItemCommand({
      TableName: TABLE,
      Key: marshall({ code }),
      ConditionExpression: 'attribute_exists(code)',
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return response(404, { error: `Link '${code}' not found` });
    }
    console.error('Delete error:', err);
    return response(500, { error: 'Failed to delete link' });
  }

  console.log(`Deleted link: ${code}`);
  return response(200, { message: `Link '${code}' deleted`, code });
}

/* ── GET /admin/links/{code}/stats ─────────────────── */
async function getLinkStats(code) {
  try {
    const res = await dynamo.send(new QueryCommand({
      TableName: LOG_TABLE,
      KeyConditionExpression: 'pk = :code',
      ExpressionAttributeValues: marshall({ ':code': code }),
      ScanIndexForward: false,
      Limit: 200,
    }));

    const logs = (res.Items || []).map(unmarshall);

    // Aggregate clicks by calendar day
    const byDay = {};
    logs.forEach(l => {
      const day = new Date(l.clicked_at).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Top referrers
    const byRef = {};
    logs.forEach(l => {
      const r = l.ref || 'direct';
      byRef[r] = (byRef[r] || 0) + 1;
    });
    const top_referrers = Object.entries(byRef)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ref, count]) => ({ ref, count }));

    return response(200, {
      code,
      total_clicks: logs.length,
      clicks_by_day: byDay,
      top_referrers,
      recent_clicks: logs.slice(0, 20).map(l => ({
        clicked_at: l.clicked_at,
        country:    l.country || null,
        ref:        l.ref     || null,
      })),
    });
  } catch (err) {
    console.warn('Stats query error (logs table may not exist):', err.message);
    return response(200, {
      code,
      total_clicks: null,
      message: 'Click log table not configured',
    });
  }
}

/* ── Handler ───────────────────────────────────────── */
exports.handler = async (event) => {
  const method = event.httpMethod;
  const path   = event.path || '';

  console.log('admin event:', JSON.stringify({ method, path }));

  // CORS preflight
  if (method === 'OPTIONS') {
    return response(204, '');
  }

  // DELETE /links/{code}
  if (method === 'DELETE') {
    const code = event.pathParameters?.code || path.split('/').pop();
    return deleteLink(code);
  }

  // GET /admin/links/{code}/stats
  if (method === 'GET' && path.match(/\/admin\/links\/[^/]+\/stats$/)) {
    const code = event.pathParameters?.code || path.split('/')[3];
    return getLinkStats(code);
  }

  // GET /admin/links
  if (method === 'GET') {
    return listLinks(event);
  }

  return response(405, { error: 'Method not allowed' });
};


