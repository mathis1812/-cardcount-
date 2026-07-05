import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('affiche le titre Hello CardCount', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Hello CardCount' }),
    ).toBeInTheDocument()
  })
})
