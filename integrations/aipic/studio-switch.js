(() => {
  function mount() {
    const existing = document.getElementById('midcode-studio-switch');
    if (existing?.dataset.fastSwitch === '1') return;
    const video = location.pathname.startsWith('/video/');
    const resumeKey = 'midcode_video_resume';
    const validPath = path => /^\/video\/u\/[1-9]\d*\/$/.test(path || '');
    const forgetResume = () => { document.cookie = `${resumeKey}=; Path=/; Secure; SameSite=Lax; Max-Age=0`; };
    // A short-lived navigation hint, never an authorization token. Keep the
    // workbench's per-user localStorage/IndexedDB isolation intact.
    if (!video && new URLSearchParams(location.hash.slice(1)).has('midcode_code')) forgetResume();
    if (video && validPath(location.pathname)) document.cookie = `${resumeKey}=${location.pathname}; Path=/; Secure; SameSite=Lax; Max-Age=300`;
    const saved = document.cookie.split('; ').find(item => item.startsWith(resumeKey + '='))?.slice(resumeKey.length + 1);
    const resumePath = validPath(saved) ? saved : null;

    const style = document.createElement('style');
    style.textContent = `
      html { height:100%; }
      body { padding-top:48px!important; box-sizing:border-box; }
      #root { height:calc(100dvh - 48px)!important; min-height:0!important; }
      #root .retouch-app-main, #root .retouch-app-grid { height:calc(100dvh - 48px)!important; min-height:0!important; }
      #root .h-screen { height:calc(100dvh - 48px)!important; }
      #root .min-h-screen { min-height:calc(100dvh - 48px)!important; }
      #app { height:calc(100dvh - 48px)!important; }
      #app > .home { height:calc(100dvh - 48px)!important; }
      #midcode-studio-switch { position:fixed;inset:0 0 auto;height:48px;z-index:1000;display:flex;align-items:center;gap:20px;padding:0 20px;box-sizing:border-box;background:#fff;border-bottom:1px solid #e5e7eb;color:#172337;font:13px system-ui,sans-serif; }
      #midcode-studio-switch strong { font-size:14px;white-space:nowrap; }
      #midcode-studio-switch .studioTabs { display:flex;gap:3px;padding:3px;background:#f1f5f5;border-radius:9px; }
      #midcode-studio-switch a { text-decoration:none;color:#64748b;padding:5px 16px;border-radius:6px;white-space:nowrap; }
      #midcode-studio-switch a[aria-current=page] { background:#fff;color:#0f766e;box-shadow:0 1px 4px #0001;font-weight:600; }
      #midcode-studio-switch a:hover { color:#0f766e; }
      #midcode-studio-switch .studioBack { margin-left:auto;padding-right:0; }
      @media(max-width:480px) { #midcode-studio-switch { padding:0 12px;gap:10px; } #midcode-studio-switch a { padding:5px 12px; } #midcode-studio-switch strong { font-size:12px; } }
    `;
    document.head.append(style);
    const nav = existing || document.createElement('nav');
    nav.dataset.fastSwitch = '1';
    nav.id = 'midcode-studio-switch';
    nav.setAttribute('aria-label', '创作工作台切换');
    nav.innerHTML = `<strong>MIDCODE 创作中心</strong><div class="studioTabs"><a href="/" ${video ? '' : 'aria-current="page"'}>图片</a><a href="https://midcode.cc/video-studio" ${video ? 'aria-current="page"' : ''}>视频</a></div><a class="studioBack" href="https://midcode.cc/dashboard">控制台 ↗</a>`;
    const videoLink = nav.querySelector('.studioTabs a:last-child');
    let switching = false;
    videoLink.addEventListener('click', async event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (video) { event.preventDefault(); return; }
      if (!resumePath) return;
      event.preventDefault();
      if (switching) return;
      switching = true;
      videoLink.textContent = '正在切换…';
      videoLink.setAttribute('aria-busy', 'true');
      try {
        // HEAD reaches the existing gateway's session/IP and workspace-owner checks.
        // Never trust the remembered path as authorization.
        const response = await fetch(resumePath, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
        if (response.ok) { location.assign(resumePath); return; }
      } catch { /* Expired session or unavailable workspace: use a fresh handoff. */ }
      forgetResume();
      location.assign('https://midcode.cc/video-studio');
    });
    document.body.append(nav);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
