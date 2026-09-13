// Public credits travel with the stable programme id, including intentional blanks.
export function programCredits(program) {
  return program?.kind === 'PERFORMANCE' ? program.performers ?? '' : ''
}
