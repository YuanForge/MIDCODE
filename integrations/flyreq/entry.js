/* Reuse a server-validated workbench session only when it matches the current main-site account. */
(async () => {
  const status = document.getElementById('status');
  const request = (url, options = {}) => fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  const workspacePath = '/studio-preview/zh/';
  const loadWorkspace = async () => {
    const response = await request(workspacePath);
    if (response.status === 401 || response.status === 403) return { html: '', owner: undefined };
    if (!response.ok) throw Error('工作台暂时无法连接，请重试 / Workspace unavailable');
    const html = await response.text();
    // Only the authenticated gateway emits this numeric account marker.
    const owner = html.match(/window\.__MIDCODE_STUDIO__=\{"userId":(\d+),/);
    return { html, owner: owner?.[1] };
  };
  const displayWorkspace = ({ html, owner }, expected) => {
    if (!owner || owner !== String(expected)) throw Error('账户已变更，请重新进入工作台 / Account changed');
    history.replaceState(null, '', workspacePath);
    // Install authenticated same-origin HTML in this document: no second page navigation.
    document.open(); document.write(html); document.close();
  };
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
      if (Date.now() - Number(localStorage.getItem('midcode-entry:' + uid + ':refreshedAt') || 0) < 900000) {
        const workspace = await loadWorkspace();
        if (workspace.owner === uid) { displayWorkspace(workspace, uid); return; }
      }
    }
    status.textContent = '正在同步账户模型 / Connecting account models…';
    const handoff = await request('/api/user/video-studio/handoff', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    if (!handoff.ok) throw Error('无法连接账户，请重新登录或重试 / Please sign in again or retry');
    code = new URLSearchParams(new URL((await handoff.json()).url).hash.slice(1)).get('midcode_code');
  }
  status.textContent = '正在打开工作台 / Opening workspace…';
  const exchange = await request('/studio-preview/midcode/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  if (!exchange.ok) throw Error('无法连接工作台，请重试 / Unable to connect, please retry');
  const exchanged = await exchange.json();
  uid = String(exchanged.userId);
  if (uid) localStorage.setItem('midcode-entry:' + uid + ':refreshedAt', String(Date.now()));
  displayWorkspace(await loadWorkspace(), uid);
})().catch(error => {
  document.getElementById('status').textContent = error.name === 'TimeoutError' ? '连接超时，请点击重试 / Connection timed out, please retry' : error.message;
  document.getElementById('retry').hidden = false;
  document.getElementById('failure').hidden = false;
});
