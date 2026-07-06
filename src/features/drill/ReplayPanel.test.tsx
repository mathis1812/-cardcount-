import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { Card } from '../../engine'
import { ReplayPanel } from './ReplayPanel'

describe('ReplayPanel', () => {
  test('affiche chaque carte avec sa valeur Hi-Lo et le count cumulé', () => {
    const cards: readonly Card[] = [
      { rank: '5', suit: 'hearts' }, // +1 → 1
      { rank: 'K', suit: 'spades' }, // -1 → 0
      { rank: '8', suit: 'clubs' }, // 0 → 0
    ]
    render(<ReplayPanel cards={cards} />)
    expect(screen.getByText('Rejeu pédagogique')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4) // en-tête + 3 cartes
    expect(rows[1]).toHaveTextContent('5♥')
    expect(rows[1]).toHaveTextContent('+1')
    expect(rows[2]).toHaveTextContent('K♠')
    expect(rows[2]).toHaveTextContent('-1')
    expect(rows[3]).toHaveTextContent('8♣')
    expect(rows[3]).toHaveTextContent('0')
  })
})
