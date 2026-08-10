let pendingInvitationToken = null

export function captureInvitationTokenFromUrl({
  location = window.location,
  history = window.history,
} = {}) {
  if (location.pathname !== '/welcome') return null

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
