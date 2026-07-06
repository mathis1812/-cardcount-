import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { SessionResult } from '../../engine'
import { ResultsPanel } from './ResultsPanel'

const baseResult: SessionResult = {
  correct: true,
  expectedCount: 3,
  givenCount: 3,
  accuracy: 1,
  cardsSeen: 20,
  checkpointAnswers: [],
}

describe('ResultsPanel', () => {
  test('session réussie : félicitations, counts, accuracy et XP', () => {
    render(<ResultsPanel result={baseResult} xpEarned={10} />)
    expect(screen.getByText('Bien joué !')).toBeInTheDocument()
    expect(screen.getByText('Count attendu : 3')).toBeInTheDocument()
    expect(screen.getByText('Ta réponse : 3')).toBeInTheDocument()
    expect(screen.getByText('Précision : 100 %')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
  })

  test('session ratée : message d’échec', () => {
    render(
      <ResultsPanel
        result={{ ...baseResult, correct: false, givenCount: 5, accuracy: 0 }}
        xpEarned={1}
      />,
    )
    expect(screen.getByText('Raté…')).toBeInTheDocument()
    expect(screen.getByText('Ta réponse : 5')).toBeInTheDocument()
    expect(screen.getByText('Précision : 0 %')).toBeInTheDocument()
  })
})
