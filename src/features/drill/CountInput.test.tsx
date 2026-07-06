import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CountInput } from './CountInput'

describe('CountInput', () => {
  test('soumet un entier (négatif inclus) et vide le champ', () => {
    const onSubmit = vi.fn()
    render(<CountInput label="Count ?" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Count ?')
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onSubmit).toHaveBeenCalledWith(-3)
    expect(input).toHaveValue(null)
  })

  test('ignore une saisie vide ou non entière', () => {
    const onSubmit = vi.fn()
    render(<CountInput label="Count ?" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
