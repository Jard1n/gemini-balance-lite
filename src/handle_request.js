/**
 * Claude Balance Lite - Core Logic
 * 核心功能：解析多Key，随机负载均衡，转发至 Anthropic
 */

const TARGET_HOST = 'api.anthropic.com';
const DEFAULT_VERSION = '2023-06-01'; // Claude 当前默认版本

export default async function handleRequest(request, env) {
  const url = new URL(request.url);

  // 1. 处理 CORS 预检请求 (浏览器端调用必须)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 2. 特殊路由处理
  // 如果访问根目录，返回简单提示
  if (url.pathname === '/') {
    return new Response('Claude Balance Lite is Running.', { status: 200 });
  }

  // 3. 准备请求头
  const headers = new Headers(request.headers);
  
  // 移除可能暴露代理身份或导致错误的头部
  headers.delete('Host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('x-real-ip');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-proto');

  // 4. 核心：负载均衡 Logic
  // 客户端通常把 Key 放在 'x-api-key'
  const authHeader = headers.get('x-api-key');
  
  if (authHeader) {
    // 支持使用中文或英文逗号分隔多个 Key
    // 例如: "sk-ant-1..., sk-ant-2..."
    const keys = authHeader.split(/,|，/).map(k => k.trim()).filter(k => k);
    
    if (keys.length > 0) {
      // 随机选取一个 Key
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      headers.set('x-api-key', randomKey);
      
      // 简单混淆日志，只打印 Key 的末尾 4 位
      const keyMask = randomKey.length > 4 ? randomKey.slice(-4) : '****';
      console.log(`[Load Balance] Pool size: ${keys.length}, Selected Key ending in: ...${keyMask}`);
    }
  }

  // 5. 补充 Claude 必须的 Headers
  headers.set('Host', TARGET_HOST);
  
  // 如果客户端没传 anthropic-version，手动补上
  if (!headers.get('anthropic-version')) {
    headers.set('anthropic-version', DEFAULT_VERSION);
  }

  // 6. 构造转发 URL
  // 保持原有的 pathname (如 /v1/messages) 和 search 参数
  const newUrl = new URL(url.pathname + url.search, `https://${TARGET_HOST}`);

  // 7. 发送请求
  const newRequest = new Request(newUrl, {
    method: request.method,
    headers: headers,
    body: request.body,
    redirect: 'follow',
  });

  try {
    const response = await fetch(newRequest);

    // 8. 处理响应
    // 必须重新构建 Response 对象才能修改 Headers (CORS)
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    // 强制加上 CORS 头，允许任何来源
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    
    return newResponse;

  } catch (error) {
    // 错误处理
    return new Response(JSON.stringify({
      error: {
        type: 'proxy_error',
        message: error.message
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
