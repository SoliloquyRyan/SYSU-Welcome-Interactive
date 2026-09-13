// Keep every app request inside the deployed subpath, including WebSockets.
// Protocol discovery still describes canonical backend paths before proxy stripping.
export function applicationPath(path, base = import.meta.env.BASE_URL ?? '/') {
  const prefix = `/${String(base).replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\//, '/')
  return `${prefix}${path.replace(/^\/+/, '')}`
}
