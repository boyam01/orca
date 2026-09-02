import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { pairRuntimeEnvironment, useWorktreeAwarenessEnvironment } from './index-test-harness'

describe('orca cli worktree awareness', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('lists saved environments even when ORCA_ENVIRONMENT is set', async () => {
    process.env.ORCA_ENVIRONMENT = 'stale-env'
    listEnvironmentsMock.mockReturnValue([addEnvironmentFromPairingCodeMock()])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'list', '--json'], '/tmp/repo')

    expect(listEnvironmentsMock).toHaveBeenCalledWith('/tmp/orca-user-data')
    expect(callMock).not.toHaveBeenCalled()
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('token')
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('publicKeyB64')
  })

  it('adds saved environments even when ORCA_ENVIRONMENT is set', async () => {
    process.env.ORCA_ENVIRONMENT = 'stale-env'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['environment', 'add', '--name', 'desk', '--pairing-code', 'orca://pair#abc', '--json'],
      '/tmp/repo'
    )

    expect(addEnvironmentFromPairingCodeMock).toHaveBeenCalledWith('/tmp/orca-user-data', {
      name: 'desk',
      pairingCode: 'orca://pair#abc'
    })
    expect(callMock).not.toHaveBeenCalled()
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('token')
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('publicKeyB64')
  })

  it.each([
    [['environment', 'list'], 'environment'],
    [['environment', 'list'], 'pairing-code'],
    [['host', 'list'], 'environment'],
    [['host', 'list'], 'pairing-code']
  ] as const)(
    '%s rejects --%s instead of answering for the local machine',
    async (command, flag) => {
      const priorExitCode = process.exitCode
      process.exitCode = undefined
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      try {
        if (flag === 'environment') {
          pairRuntimeEnvironment(listEnvironmentsMock, 'env-homelab', 'homelab')
        }
        await main([...command, `--${flag}`, 'homelab', '--json'], '/tmp/repo')

        const response = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))
        expect(response).toMatchObject({
          ok: false,
          error: {
            code: 'invalid_argument'
          }
        })
        expect(response.error.message).toContain(`\`--${flag}\` does not retarget`)
        expect(process.exitCode).toBe(1)
        expect(callMock).not.toHaveBeenCalled()
      } finally {
        process.exitCode = priorExitCode
      }
    }
  )
})
