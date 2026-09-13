const interactionNumbers = { A: '一', B: '二', C: '三' }

export function interactionLabel(code) {
  return `互动环节${interactionNumbers[code] ?? ''}`
}
