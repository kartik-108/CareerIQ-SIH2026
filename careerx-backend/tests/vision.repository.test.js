import { jest } from '@jest/globals';

const query = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({ data: [{ id: 'analysis-1' }], error: null }),
};
const supabase = { from: jest.fn().mockReturnValue(query) };
jest.unstable_mockModule('../src/config/supabase.js', () => ({ supabase }));

const { getHistory } = await import('../src/repositories/vision.repository.js');

describe('vision repository', () => {
  it('scopes history to the authenticated user', async () => {
    const result = await getHistory('user-1');
    expect(result).toEqual([{ id: 'analysis-1' }]);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});