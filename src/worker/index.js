// 会员支付 Worker — 最小化实现
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/api/membership' && request.method === 'POST') {
      try {
        const { email, paymentToken, plan } = await request.json();

        if (!email || !plan) {
          return jsonResponse({ ok: false, error: '缺少参数' }, 400);
        }

        // 计算到期时间
        const planDays = { monthly: 30, quarterly: 90, yearly: 365 };
        const days = planDays[plan] || 30;
        const expiry = new Date(Date.now() + days * 86400000).toISOString();

        // 存 KV
        await env.MEMBERSHIP_KV.put(email, JSON.stringify({
          plan,
          expiry,
          createdAt: new Date().toISOString(),
        }));

        return jsonResponse({ ok: true, expiry });
      } catch (e) {
        return jsonResponse({ ok: false, error: '服务器错误' }, 500);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
