import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CardView } from './CardView'

describe('CardView', () => {
  test('affiche le rang et le symbole de la couleur', () => {
    render(<CardView card={{ rank: 'K', suit: 'hearts' }} />)
    const card = screen.getByRole('img', { name: 'K hearts' })
    expect(card).toHaveTextContent('K♥')
  })

  test('affiche un 10 de pique', () => {
    render(<CardView card={{ rank: '10', suit: 'spades' }} />)
    expect(screen.getByRole('img', { name: '10 spades' })).toHaveTextContent(
      '10♠',
    )
  })
})
