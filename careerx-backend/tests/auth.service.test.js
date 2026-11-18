// Example of mocking Supabase and AI so unit tests never hit external services.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/repositories/user.repository.js', () => ({
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  createProfile: jest.fn(),
  findUserById: jest.fn(),
  updateProfile: jest.fn(),
  softDeleteUser: jest.fn(),
}));

const userRepo = await import('../src/repositories/user.repository.js');
const { register } = await import('../src/services/auth.service.js');

describe('auth.service.register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws ConflictError if email already exists', async () => {
    userRepo.findUserByEmail.mockResolvedValue({ id: 'existing-user' });

    await expect(
      register({ email: 'taken@example.com', password: 'password123', full_name: 'Test User', role: 'student' })
    ).rejects.toThrow('An account with this email already exists');
  });

  it('creates a user and profile on success', async () => {
    userRepo.findUserByEmail.mockResolvedValue(null);
    userRepo.createUser.mockResolvedValue({
      id: 'new-user-id', email: 'new@example.com', role: 'student', password_hash: 'hashed',
    });
    userRepo.createProfile.mockResolvedValue({ id: 'profile-id' });

    const result = await register({ email: 'new@example.com', password: 'password123', full_name: 'New User', role: 'student' });

    expect(result.user.email).toBe('new@example.com');
    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('refresh_token');
    expect(userRepo.createProfile).toHaveBeenCalledWith('new-user-id', { full_name: 'New User' });
  });

  it('always creates public registrations as students', async () => {
    userRepo.findUserByEmail.mockResolvedValue(null);
    userRepo.createUser.mockResolvedValue({
      id: 'new-user-id', email: 'new@example.com', app_metadata: { role: 'student' },
    });
    userRepo.createProfile.mockResolvedValue({ id: 'profile-id' });

    await register({ email: 'new@example.com', password: 'password123', full_name: 'New User', role: 'admin' });

    expect(userRepo.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      fullName: 'New User',
      role: 'student',
    });
  });
});
