import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import App from './App'

describe('App', () => {
  test('affiche le titre et l’écran de drill', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'CardCount' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lancer la session' }),
    ).toBeInTheDocument()
  })
})
