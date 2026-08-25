import { describe, it, expect } from 'vitest'
import { refValue, decodeRef } from './SalesOrdersPage'

/**
 * A sales order line sells either a product or a service, picked from a single merged dropdown. The two
 * catalogues have independent id sequences, so "3" is ambiguous — product 3 and service 3 both exist.
 * These two functions carry the whole disambiguation, and getting them wrong would not throw: it would
 * quietly sell the wrong thing, and (worse) move stock for a service or fail to move it for a product.
 */

describe('refValue', () => {
    it('encodes a product line with a p- prefix', () => {
        expect(refValue({ productId: '3', serviceId: '' })).toBe('p-3')
    })

    it('encodes a service line with an s- prefix', () => {
        expect(refValue({ productId: '', serviceId: '3' })).toBe('s-3')
    })

    it('is empty for a line that has picked nothing yet', () => {
        expect(refValue({ productId: '', serviceId: '' })).toBe('')
    })

    it('distinguishes a product and a service sharing an id', () => {
        expect(refValue({ productId: '7', serviceId: '' }))
            .not.toBe(refValue({ productId: '', serviceId: '7' }))
    })
})

describe('decodeRef', () => {
    it('reads back a product', () => {
        expect(decodeRef('p-12')).toEqual({ isService: false, id: '12' })
    })

    it('reads back a service', () => {
        expect(decodeRef('s-12')).toEqual({ isService: true, id: '12' })
    })

    it('treats an empty selection as a non-service with no id', () => {
        expect(decodeRef('')).toEqual({ isService: false, id: '' })
        expect(decodeRef(null)).toEqual({ isService: false, id: '' })
    })

    it('round-trips both kinds', () => {
        for (const item of [{ productId: '5', serviceId: '' }, { productId: '', serviceId: '5' }]) {
            const { isService, id } = decodeRef(refValue(item))
            expect(id).toBe('5')
            expect(isService).toBe(item.serviceId !== '')
        }
    })
})
