import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

export function CountInput({
  label,
  onSubmit,
}: {
  label: string
  onSubmit: (value: number) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = Number(value)
    if (value.trim() === '' || !Number.isInteger(parsed)) {
      return
    }
    onSubmit(parsed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {label}
        <input
          type="number"
          step="1"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit">{t('drill.submit')}</button>
    </form>
  )
}
