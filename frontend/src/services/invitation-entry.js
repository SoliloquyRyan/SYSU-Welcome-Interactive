let pendingInvitationToken = null

function welcomePathForBase(basePath) {
  const baseUrl = new URL(basePath || '/', 'https://welcome.local/')
  const normalizedBase = baseUrl.pathname.replace(/\/+$/, '')
  return `${normalizedBase}/welcome`
}

function isWelcomePath(pathname, basePath) {
  const welcomePath = welcomePathForBase(basePath)
  return pathname === welcomePath || pathname === `${welcomePath}/`
}

export function captureInvitationTokenFromUrl({
  location = window.location,
  history = window.history,
  basePath = import.meta.env.BASE_URL,
} = {}) {
  if (!isWelcomePath(location.pathname, basePath)) return null

  const url = new URL(location.href)
  const token = url.searchParams.get('token')
  if (token === null) return null

  pendingInvitationToken = null
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    pendingInvitationToken = token
  }

  url.searchParams.delete('token')
  const query = url.searchParams.toString()
  history.replaceState(
    history.state,
    '',
    `${url.pathname}${query ? `?${query}` : ''}${url.hash}`,
  )
  return pendingInvitationToken
}

export function takePendingInvitationToken() {
  const token = pendingInvitationToken
  pendingInvitationToken = null
  return token
}
