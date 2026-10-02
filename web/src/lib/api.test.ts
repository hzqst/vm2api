import { describe, expect, it } from 'vitest'
import { ApiError, normalizePanelError } from './api'

describe('panel error envelope', () => {
  it('preserves structured error metadata', () => {
    const normalized = normalizePanelError(
      {
        error: {
          type: 'permission_error',
          code: 'forbidden',
          message: '没有权限',
          details: { capability: 'users' },
        },
        data: { refresh_class: 'fatal' },
      },
      403,
      'Forbidden'
    )

    expect(normalized).toEqual({
      message: '没有权限',
      status: 403,
      type: 'permission_error',
      code: 'forbidden',
      details: { capability: 'users' },
      data: { refresh_class: 'fatal' },
    })
  })

  it('keeps string error codes compatible with existing callers', () => {
    const error = new ApiError('冲突', 409, 'conflict')
    expect(error).toMatchObject({ status: 409, code: 'conflict' })
  })
})
