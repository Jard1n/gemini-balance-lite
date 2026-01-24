// src/handle_request.js

// Claude 官方 API 地址
const TARGET_HOST = 'api.anthropic.com';

export default async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // 1. 处理 CORS 预检请求 (浏览器端调用必须)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // 2. 提取并处理 Headers
  const headers = new Headers(request.headers);
  
  // 3. 核心功能：多 Key 负载均衡
  // Claude 客户端通常将 Key 放在 'x-api-key' 头部
  const authHeader = headers.get('x-api-key');
  
  if (!authHeader) {
     // 如果没有 Key，直接透传（有些特殊请求可能不需要），或者返回错误
     // 这里为了兼容性，选择尝试透传，或者你可以拦截报错
  } else {
    // 支持使用中文或英文逗号分隔多个 Key
    const keys = authHeader.split(/,|，/).map(k => k.trim()).filter(k => k);
    if (keys.length > 0) {
      // 随机选取一个 Key
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      // 覆盖原有的 Header，只发送选中的这一个 Key 给 Claude
      headers.set('x-api-key', randomKey);
      console.log(`[Load Balance] Using key: ${randomKey.slice(0, 8)}***`);
    }
  }

  // 4. 必要的 Claude Headers 处理
  // 确保 Host 指向 Claude，而不是你的 Worker 域名
  headers.set('Host', TARGET_HOST);
  // 确保 Content-Type 正确
  if (!headers.get('content-type')) {
    headers.set('content-type', 'application/json');
  }
  // 必须透传或设置 anthropic-version，如果客户端没传，默认一个
  if (!headers.get('anthropic-version')) {
      headers.set('anthropic-version', '2023-06-01');
  }

  // 5. 构建转发请求
  // 保持原有路径（例如 /v1/messages）和查询参数
  const newUrl = new URL(url.pathname + url.search, `https://${TARGET_HOST}`);
  
  const newRequest = new Request(newUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });

  // 6. 发送请求并处理响应
  try {
    const response = await fetch(newRequest);
    
    // 创建新的响应对象以修改 Headers (主要是 CORS)
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    
    return newResponse;
  } catch (e) {
    return new Response(JSON.stringify({ error: `Proxy Error: ${e.message}` }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
