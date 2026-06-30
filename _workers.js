// 生成随机后缀的函数
function generateRandomSuffix(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 统一通用头部：CORS + 关闭全部缓存
const commonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  // 关闭CDN、浏览器缓存，每次都重新执行Worker读取KV
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

async function handleRequest(request) {
  // 处理OPTIONS跨域预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: commonHeaders });
  }

  const url = new URL(request.url);
  let targetUrl;
  let customSuffix;

  if (typeof LINKS === 'undefined' || !LINKS) {
    return new Response(JSON.stringify({
      Code: 500,
      Message: '请去Workers控制台-设置 将变量名称设定为“LINKS”并绑定KV命名空间然后重试部署！'
    }), {
      status: 200,
      headers: commonHeaders
    });
  }

  if (request.method === 'GET') {
    targetUrl = url.searchParams.get('longUrl');
    customSuffix = url.searchParams.get('shortKey');
  } else if (request.method === 'POST') {
    const formData = await request.formData();
    targetUrl = formData.get('longUrl');
    customSuffix = formData.get('shortKey');
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({
      Code: 201,
      Message: 'failed to get long URL, please check the short URL if exists or expired'
    }), {
      status: 200,
      headers: commonHeaders
    });
  }

  try {
    targetUrl = atob(targetUrl);
  } catch (error) {
    return new Response(JSON.stringify({
      Code: 201,
      Message: 'failed to decode long URL, please check if it is properly encoded'
    }), {
      status: 200,
      headers: commonHeaders
    });
  }

  const suffix = customSuffix || generateRandomSuffix(6);
  const workerDomain = request.headers.get('host');
  const existingUrl = await LINKS.get(suffix);

  if (existingUrl) {
    return new Response(JSON.stringify({
      Code: 201,
      Message: 'short key already exists, please use another one or leave it empty to generate automatically.'
    }), {
      status: 200,
      headers: commonHeaders
    });
  }

  const shortLink = `https://${workerDomain}/${suffix}`;
  await LINKS.put(suffix, targetUrl);

  return new Response(JSON.stringify({
    Code: 1,
    ShortUrl: shortLink
  }), {
    status: 200,
    headers: commonHeaders
  });
}

async function handleRedirect(request) {
  const url = new URL(request.url);
  const suffix = url.pathname.split('/')[1];

  if (typeof LINKS === 'undefined' || !LINKS) {
    return new Response(JSON.stringify({
      Code: 500,
      Message: '请去Workers控制台-设置 将变量名称设定为“LINKS”并绑定KV命名空间然后重试部署！'
    }), {
      status: 200,
      headers: commonHeaders
    });
  }

  const targetUrl = await LINKS.get(suffix);

  if (targetUrl) {
    // 关键修改：302临时重定向，不缓存跳转记录
    return Response.redirect(targetUrl, 302);
  } else {
    return new Response('Short link not found', {
      status: 404,
      headers: commonHeaders
    });
  }
}

addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 根路径代理静态页面，禁用缓存
  if (url.pathname === '/') {
    const proxyReq = new Request('https://kiko923.github.io/MyUrls-Workers/', {
      cache: "no-store" // 不缓存代理页面
    });
    event.respondWith(fetch(proxyReq).then(res => {
      const newHeaders = new Headers(res.headers);
      // 给静态页面也加上无缓存头
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      newHeaders.set('Pragma', 'no-cache');
      newHeaders.set('Expires', '0');
      return new Response(res.body, {
        status: res.status,
        headers: newHeaders
      });
    }));
  } else if (url.pathname === '/short') {
    event.respondWith(handleRequest(event.request));
  } else if (url.pathname.startsWith('/')) {
    event.respondWith(handleRedirect(event.request));
  } else {
    event.respondWith(new Response('Not Found', {
      status: 404,
      headers: commonHeaders
    }));
  }
});
