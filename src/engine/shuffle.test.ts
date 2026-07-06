import { describe, expect, test } from 'vitest'
import { buildDecks, runningCount } from './cards'
import { createRng, shuffle } from './shuffle'

describe('createRng', () => {
  test('même seed produit la même séquence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  test('seeds différents produisent des séquences différentes', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(
      Array.from({ length: 5 }, () => b()),
    )
  })

  test('les valeurs sont dans [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  test('ne mute pas le tableau source', () => {
    const source = [1, 2, 3, 4, 5]
    const copy = [...source]
    shuffle(source, createRng(1))
    expect(source).toEqual(copy)
  })

  test('retourne une permutation (mêmes éléments, même taille)', () => {
    const source = Array.from({ length: 52 }, (_, i) => i)
    const result = shuffle(source, createRng(3))
    expect(result).toHaveLength(52)
    expect([...result].sort((a, b) => a - b)).toEqual(source)
  })

  test('même seed produit le même ordre, seeds différents des ordres différents', () => {
    const source = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffle(source, createRng(9))).toEqual(shuffle(source, createRng(9)))
    expect(shuffle(source, createRng(9))).not.toEqual(
      shuffle(source, createRng(10)),
    )
  })

  test('propriété : un deck complet mélangé garde un count de 0', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      expect(runningCount(shuffle(buildDecks(2), createRng(seed)))).toBe(0)
    }
  })
})
