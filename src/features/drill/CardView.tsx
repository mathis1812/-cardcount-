import type { Card, Suit } from '../../engine'

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const RED_SUITS: readonly Suit[] = ['hearts', 'diamonds']

export function CardView({ card }: { card: Card }) {
  const color = RED_SUITS.includes(card.suit) ? '#c0392b' : '#1a1a2e'
  return (
    <div
      role="img"
      aria-label={`${card.rank} ${card.suit}`}
      style={{
        display: 'inline-block',
        padding: '2rem 1.5rem',
        border: '2px solid #ccc',
        borderRadius: '12px',
        fontSize: '3rem',
        fontWeight: 700,
        color,
        background: '#fff',
      }}
    >
      {card.rank}
      {SUIT_SYMBOLS[card.suit]}
    </div>
  )
}
