// Throwaway spike (T001): proves a `__session` cookie survives Hosting -> Cloud Run on a real iPhone.
// No dependencies on purpose. Delete the whole spike/ folder once the result is recorded.
const http = require('node:http');
const crypto = require('node:crypto');

const MAX_AGE = 14 * 24 * 3600;
const COOKIE = '__session';

function readCookie(header) {
  const match = (header || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`));
  return match ? match.slice(COOKIE.length + 1) : null;
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/api/spike/set') {
      const value = crypto.randomBytes(16).toString('hex');
      return send(res, 200, { set: value }, {
        'Set-Cookie': `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`,
      });
    }
    if (url === '/api/spike/clear') {
      return send(res, 200, { cleared: true }, {
        'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
      });
    }
    if (url === '/api/spike/read') {
      return send(res, 200, {
        cookieReceived: readCookie(req.headers.cookie),
        otherCookiesReceived: Object.keys(req.headers).includes('cookie') && !readCookie(req.headers.cookie),
        origin: req.headers.origin || null,
        host: req.headers.host || null,
        xForwardedHost: req.headers['x-forwarded-host'] || null,
        xForwardedProto: req.headers['x-forwarded-proto'] || null,
        serverTime: new Date().toISOString(),
      });
    }
    return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  })
  .listen(process.env.PORT || 8080);
