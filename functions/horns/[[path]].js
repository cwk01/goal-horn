// Serves the horn library at goalhorn.colbykordas.com/horns/... from the goal-horns R2 bucket.
// Layout is in the README under "The horn library". The bucket is bound as HORNS in wrangler.toml.
const KEY = /^(?:[A-Z0-9]{2,6}\/[A-Z0-9]{2,6}|_generic\/(?:hockey|baseball|football))\/(?:goal|win)\.mp3$/;
const DAY = 86400;

export async function onRequest({ request, env, params, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const key = [].concat(params.path || []).join('/');
  if (!KEY.test(key)) return notFound();

  // Cache the whole file at the edge, keyed without the Range header, so most plays never reach R2.
  const cache = caches.default;
  const cacheKey = new Request(new URL('/horns/' + key, request.url).toString());
  let res = await cache.match(cacheKey);
  if (!res) {
    const obj = await env.HORNS.get(key);
    if (!obj) return notFound();
    const headers = new Headers({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': `public, max-age=${DAY}`,
      'Access-Control-Allow-Origin': '*',
      ETag: obj.httpEtag,
    });
    res = new Response(obj.body, { headers });
    waitUntil(cache.put(cacheKey, res.clone()));
  }
  if (request.method === 'HEAD') return new Response(null, { headers: res.headers });
  return res;
}

// Short cache so a horn added to the bucket shows up within a minute.
function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
}
