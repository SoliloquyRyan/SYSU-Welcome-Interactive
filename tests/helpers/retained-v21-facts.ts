// Compare all historical columns while schema 22 adds these explicitly tested defaults.
export function retainedV21Facts<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows, (key, value) =>
    key === 'account_type' || key === 'score_eligible' ? undefined : value)) as T
}
