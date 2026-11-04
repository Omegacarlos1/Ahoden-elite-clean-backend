import { expect } from 'chai';

import {
  accraBusinessParts,
  calculateQuoteAmounts
} from '../../src/modules/catalogue/catalogue.service.js';

describe('catalogue pricing and business time', () => {
  it('calculates GHS minor-unit tax with deterministic half-up rounding', () => {
    const amounts = calculateQuoteAmounts(
      {
        base_amount_minor: 12_345,
        included_bedrooms: 1,
        bedroom_surcharge_minor: 1_500,
        tax_basis_points: 1_250
      },
      3
    );

    expect(amounts).to.deep.equal({
      subtotalMinor: 15_345,
      taxMinor: 1_918,
      totalMinor: 17_263
    });
  });

  it('rounds an exact half minor unit upward without floating-point arithmetic', () => {
    const amounts = calculateQuoteAmounts(
      {
        base_amount_minor: 10_003,
        included_bedrooms: 0,
        bedroom_surcharge_minor: 0,
        tax_basis_points: 5_000
      },
      0
    );

    expect(amounts.taxMinor).to.equal(5_002);
  });

  it('renders stored UTC instants in the Africa/Accra business zone', () => {
    expect(accraBusinessParts(new Date('2026-11-05T09:30:00.000Z'))).to.deep.equal({
      date: '2026-11-05',
      dayOfWeek: 4,
      minuteOfDay: 570,
      display: '2026-11-05T09:30:00[Africa/Accra]'
    });
  });
});
