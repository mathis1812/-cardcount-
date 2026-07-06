import { useTranslation } from 'react-i18next'
import { hiLoValue, type Card, type Suit } from '../../engine'

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const formatSigned = (value: number): string =>
  value > 0 ? `+${value}` : `${value}`

export function ReplayPanel({ cards }: { cards: readonly Card[] }) {
  const { t } = useTranslation()
  const rows = cards.reduce<{ card: Card; value: number; total: number }[]>(
    (acc, card) => {
      const value = hiLoValue(card)
      const total = (acc.at(-1)?.total ?? 0) + value
      return [...acc, { card, value, total }]
    },
    [],
  )
  return (
    <section>
      <h2>{t('drill.replayTitle')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('drill.replayCard')}</th>
            <th>{t('drill.replayValue')}</th>
            <th>{t('drill.replayCount')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, value, total }, index) => (
            <tr key={index}>
              <td>
                {card.rank}
                {SUIT_SYMBOLS[card.suit]}
              </td>
              <td>{formatSigned(value)}</td>
              <td>{formatSigned(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
