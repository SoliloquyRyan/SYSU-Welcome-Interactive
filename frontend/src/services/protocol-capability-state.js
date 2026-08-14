import { protocolCapabilityApi } from './api'
import { isV2RuntimeActive } from './protocol-compatibility'

const INITIAL_STATE = Object.freeze({
  status: 'idle',
  discovery: null,
  handshake: null,
  error: null,
  v2RuntimeActive: false,
})

export function createProtocolCapabilityState(client = protocolCapabilityApi) {
  let current = INITIAL_STATE

  function update(next) {
    current = Object.freeze({ ...current, ...next })
    return current
  }

  async function discover() {
    update({
      status: 'checking',
      discovery: null,
      handshake: null,
      error: null,
      v2RuntimeActive: false,
    })
    try {
      const discovery = await client.discover()
      update({
        status: isV2RuntimeActive(discovery) ? 'active' : 'contracts_ready',
        discovery,
        error: null,
        v2RuntimeActive: isV2RuntimeActive(discovery),
      })
      return discovery
    } catch (error) {
      update({
        status: 'blocked',
        error,
        v2RuntimeActive: false,
      })
      throw error
    }
  }

  async function handshake(input) {
    update({ status: 'checking', handshake: null, error: null })
    try {
      const response = await client.handshake(input)
      update({
        status: isV2RuntimeActive(response) ? 'active' : 'contracts_ready',
        handshake: response,
        error: null,
        v2RuntimeActive: isV2RuntimeActive(response),
      })
      return response
    } catch (error) {
      update({
        status: 'blocked',
        error,
        v2RuntimeActive: false,
      })
      throw error
    }
  }

  return {
    get current() {
      return current
    },
    discover,
    handshake,
    reset() {
      current = INITIAL_STATE
    },
  }
}
