/* 在 Next.js 启动前安装用户隔离和候选工作台路径映射；配置由已认证网关注入。 */
(() => {
  const config = window.__MIDCODE_STUDIO__;
  if (!config) return;
  const prefix = config.prefix;
  const scope = `midcode-unified:${config.userId}:`;
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (key, ...args) { return original.call(this, scope + key, ...args); };
  }
  // 同源控制台的 token 和其他用户数据不得被工作台的清空操作删除。
  Storage.prototype.clear = function () {
    for (const key of Object.keys(this)) if (key.startsWith(scope)) delete this[key];
  };
  for (const method of ['open', 'deleteDatabase']) {
    const original = IDBFactory.prototype[method];
    IDBFactory.prototype[method] = function (name, ...args) { return original.call(this, scope + name, ...args); };
  }
  localStorage.setItem('flyreq-model-registry', JSON.stringify(config.registry));
  /** 只改写当前站点工作台自己的接口地址；输入 URL，返回候选路径。 */
  function mapped(value) {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/flyreq/')) url.pathname = prefix + url.pathname;
    return url.href;
  }
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (input instanceof Request) return originalFetch(new Request(mapped(input.url), input), init);
    return originalFetch(mapped(String(input)), init);
  };
  const OriginalSocket = window.WebSocket;
  window.WebSocket = class extends OriginalSocket {
    constructor(url, protocols) {
      const target = new URL(url, location.href);
      if (target.host === location.host && target.pathname.startsWith('/api/flyreq/')) target.pathname = prefix + target.pathname;
      super(target.href, protocols);
    }
  };
})();
