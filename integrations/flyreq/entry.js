/* Reuse a server-validated workbench session only when it matches the current main-site account. */
(async () => {
  const status = document.getElementById('status');
  const request = (url, options = {}) => fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  let uid;
  let code = new URLSearchParams(location.hash.slice(1)).get('midcode_code');
  history.replaceState(null, '', location.pathname);
  if (!code) {
    const token = localStorage.getItem('token');
    if (!token) throw Error('请先登录 MIDCODE / Please sign in to MIDCODE');

    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(part));
      if (Number(claims.exp) * 1000 > Date.now()) uid = String(claims.sub);
    } catch {}
    // JWT payload is only an account-matching hint, never an authorization decision.
    if (uid && /^\d+$/.test(uid)) {
      status.textContent = '正在恢复工作台 / Resuming workspace…';
      const resumed = await request('/studio-preview/midcode/session');
      const session = resumed.ok ? await resumed.json() : null;
      if (session && String(session.userId) === uid && Date.now() - Number(localStorage.getItem('midcode-entry:' + uid + ':refreshedAt') || 0) < 900000) {
        location.replace('/studio-preview/zh/');
        return;
      }
      if (!resumed.ok && ![401, 403].includes(resumed.status)) throw Error('工作台暂时无法连接，请重试 / Workspace unavailable, please retry');
    }
    status.textContent = '正在同步账户模型 / Connecting account models…';
    const handoff = await request('/api/user/video-studio/handoff', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    if (!handoff.ok) throw Error('无法连接账户，请重新登录或重试 / Please sign in again or retry');
    code = new URLSearchParams(new URL((await handoff.json()).url).hash.slice(1)).get('midcode_code');
  }
  status.textContent = '正在打开工作台 / Opening workspace…';
  const exchange = await request('/studio-preview/midcode/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  if (!exchange.ok) throw Error('无法连接工作台，请重试 / Unable to connect, please retry');
  if (uid) localStorage.setItem('midcode-entry:' + uid + ':refreshedAt', String(Date.now()));
  location.replace('/studio-preview/zh/');
})().catch(error => {
  document.getElementById('status').textContent = error.name === 'TimeoutError' ? '连接超时，请点击重试 / Connection timed out, please retry' : error.message;
  document.getElementById('retry').hidden = false;
});
