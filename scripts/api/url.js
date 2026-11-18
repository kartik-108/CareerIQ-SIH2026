export function buildApiUrl(apiBaseUrl, path) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  const suffix = path && path !== '/' ? `/${String(path).replace(/^\/+/, '')}` : '';
  return `${base}${suffix}`;
}
