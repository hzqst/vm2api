/**
 * SSH auth plan, ported from Tabby `tabby-ssh/src/session/authMethodSelection.ts`.
 *
 * ssh2's `authHandler(methodsLeft, partialSuccess, next)` hands us the server's
 * remaining methods after each failure; this keeps Tabby's rule of only trying
 * a configured method the server still allows, so a password is never sent to a
 * server that only accepts keys.
 */

export function selectNextAuthMethod(remainingMethods, allowedMethods, getAuthType) {
  if (!allowedMethods.length) return remainingMethods[0]
  return remainingMethods.find((method) => allowedMethods.includes(getAuthType(method)))
}

export function updateAuthPlanAfterFailure(remainingMethods, failure, getAuthType, createPartialSuccessFallback) {
  const updatedRemainingMethods = [...remainingMethods]
  const updatedAllowedMethods = [...failure.remainingMethods]

  if (failure.partialSuccess) {
    for (const authType of updatedAllowedMethods) {
      if (!updatedRemainingMethods.some((method) => getAuthType(method) === authType)) {
        const fallback = createPartialSuccessFallback(authType)
        if (fallback) updatedRemainingMethods.push(fallback)
      }
    }
  }

  return {
    remainingMethods: updatedRemainingMethods,
    allowedMethods: updatedAllowedMethods,
  }
}

/**
 * Build an ssh2 `authHandler` from stored credentials.
 * @param {{ username: string, authType: 'key'|'password', password?: string|null, privateKey?: string|null, passphrase?: string|null }} creds
 */
export function createAuthHandler(creds) {
  const methods = []
  if (creds.authType === 'key' && creds.privateKey) {
    methods.push({
      type: 'publickey',
      username: creds.username,
      key: creds.privateKey,
      ...(creds.passphrase ? { passphrase: creds.passphrase } : {}),
    })
  }
  if (creds.authType === 'password' && creds.password) {
    methods.push({ type: 'password', username: creds.username, password: creds.password })
    // Many sshd configs expose password auth only as keyboard-interactive.
    methods.push({
      type: 'keyboard-interactive',
      username: creds.username,
      prompt: (_name, _instructions, _lang, prompts, finish) => finish(prompts.map(() => creds.password)),
    })
  }

  let plan = { remainingMethods: methods, allowedMethods: [] }
  let started = false
  const typeOf = (m) => m.type

  return (methodsLeft, partialSuccess, next) => {
    if (started) {
      plan = updateAuthPlanAfterFailure(
        plan.remainingMethods,
        { partialSuccess: !!partialSuccess, remainingMethods: methodsLeft || [] },
        typeOf,
        () => null,
      )
    } else {
      started = true
      if (methodsLeft) plan = { ...plan, allowedMethods: [...methodsLeft] }
    }
    const method = selectNextAuthMethod(plan.remainingMethods, plan.allowedMethods, typeOf)
    if (!method) return next(false)
    plan = { ...plan, remainingMethods: plan.remainingMethods.filter((m) => m !== method) }
    return next(method)
  }
}
