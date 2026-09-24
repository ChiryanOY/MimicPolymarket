jest.mock('../../utils/fetchData', () => ({ __esModule: true, default: jest.fn() }));

import { parseGammaMarketMetadata } from '../marketMetadata';

describe('parseGammaMarketMetadata', () => {
    it('maps a token id to its market outcome', () => {
        expect(
            parseGammaMarketMetadata('22', [
                {
                    conditionId: '0xcondition',
                    question: 'Will it happen?',
                    slug: 'will-it-happen',
                    clobTokenIds: '["11","22"]',
                    outcomes: '["Yes","No"]',
                    negRisk: true,
                    events: [{ slug: 'event-slug' }],
                },
            ])
        ).toEqual({
            conditionId: '0xcondition',
            title: 'Will it happen?',
            slug: 'will-it-happen',
            eventSlug: 'event-slug',
            icon: '',
            outcome: 'No',
            outcomeIndex: 1,
            negativeRisk: true,
        });
    });

    it('returns null for an unrelated token', () => {
        expect(
            parseGammaMarketMetadata('99', [
                { conditionId: '0xcondition', clobTokenIds: '["11","22"]' },
            ])
        ).toBeNull();
    });
});
