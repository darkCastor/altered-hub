import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';

// Import functions from mocked modules to be used with vi.mocked()
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { randomUUID } from 'crypto';

// Mock @simplewebauthn/server (hoisted)
// Factory is defined below imports to allow use of vi.fn() from the vitest import
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

// Mock crypto (hoisted)
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object), // Spread actual module exports
    randomUUID: vi.fn(() => 'mocked-uuid'), // Override randomUUID
  };
});

// Mock $lib/authConfig explicitly using vi.doMock (applied before dynamic import)
vi.doMock('$lib/authConfig', () => ({
  rpId: 'test.com',
  rpName: 'Test App',
  expectedOrigin: 'http://test.com',
}));

// Mock $lib/devAuthStore explicitly using vi.doMock (applied before dynamic import)
const mockUserStore = {
  getUser: vi.fn(),
  createUser: vi.fn(),
  addCredentialToUser: vi.fn(),
  getUserById: vi.fn(),
};
const mockChallengeStore = {
  storeChallenge: vi.fn(),
  getChallenge: vi.fn(),
  clearChallenge: vi.fn(),
};
const mockSessionStore = {
  setSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
};
vi.doMock('$lib/devAuthStore', () => ({
  devUserStore: mockUserStore,
  devChallengeStore: mockChallengeStore,
  devSessionStore: mockSessionStore,
}));


// Dynamically import server endpoints after mocks are set up
const { POST: registerStartPOST } = await import('../../src/routes/auth/register/start/+server');
const { POST: registerFinishPOST } = await import('../../src/routes/auth/register/finish/+server');
const { POST: loginStartPOST } = await import('../../src/routes/auth/login/start/+server');
const { POST: loginFinishPOST } = await import('../../src/routes/auth/login/finish/+server');
const { POST: logoutPOST } = await import('../../src/routes/auth/logout/+server');


// Helper to create mock RequestEvent
const createMockRequestEvent = (body: any = {}, cookies: Record<string, string> = {}): Partial<RequestEvent> => {
  const cookieStore = new Map(Object.entries(cookies));
  return {
    request: {
      json: async () => body,
      // Add other request properties if needed by endpoints
    } as any,
    cookies: {
      get: (name: string) => cookieStore.get(name),
      set: vi.fn((name: string, value: string, options: any) => cookieStore.set(name, value)),
      delete: vi.fn((name: string, options: any) => cookieStore.delete(name)),
      // Add other cookie methods if needed
    } as any,
    // Add other event properties if needed
    locals: {} as any, // Ensure locals is defined
  };
};

describe('Auth Server Endpoints', () => {

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    // vi.clearAllMocks() might be better if resetAllMocks has issues with some mocks

    // Resetting mocks on the mock objects themselves
    Object.values(mockUserStore).forEach(mockFn => mockFn.mockClear());
    Object.values(mockChallengeStore).forEach(mockFn => mockFn.mockClear());
    Object.values(mockSessionStore).forEach(mockFn => mockFn.mockClear());

    // Resetting mocks on the mock objects themselves
    Object.values(mockUserStore).forEach(mockFn => mockFn.mockClear());
    Object.values(mockChallengeStore).forEach(mockFn => mockFn.mockClear());
    Object.values(mockSessionStore).forEach(mockFn => mockFn.mockClear());

    // Resetting mocks on the imported functions
    vi.mocked(generateRegistrationOptions).mockClear();
    vi.mocked(verifyRegistrationResponse).mockClear();
    vi.mocked(generateAuthenticationOptions).mockClear();
    vi.mocked(verifyAuthenticationResponse).mockClear();
    vi.mocked(randomUUID).mockClear().mockReturnValue('mocked-uuid'); // ensure it returns value after clear

    // No need to re-mock modules mocked with vi.doMock as they are persistently mocked for $lib/*
    // For modules mocked with vi.mock (like crypto and @simplewebauthn/server),
    // their factories run once. Clearing is about resetting call counts and specific mockReturnValue/Impl.
  });

  // --- /auth/register/start ---
  describe('/auth/register/start', () => {
    it('should generate registration options for a new user', async () => {
      const mockOptions = { challenge: 'new_challenge', user: { id: 'user1' } };
      vi.mocked(generateRegistrationOptions).mockResolvedValue(mockOptions);
      mockUserStore.getUser.mockReturnValue(undefined);
      mockUserStore.createUser.mockReturnValue({ id: 'user1', username: 'testuser', credentials: [] });

      const event = createMockRequestEvent({ username: 'testuser' }) as RequestEvent;
      const response = await registerStartPOST(event);
      const jsonResponse = await response.json();

      expect(mockUserStore.getUser).toHaveBeenCalledWith('testuser');
      expect(mockUserStore.createUser).toHaveBeenCalledWith('testuser');
      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'test.com',
          rpName: 'Test App',
          userID: 'user1',
          userName: 'testuser',
          excludeCredentials: [],
        })
      );
      expect(mockChallengeStore.storeChallenge).toHaveBeenCalledWith('user1', 'new_challenge');
      expect(jsonResponse).toEqual(mockOptions);
    });

    it('should generate options with excludeCredentials for an existing user', async () => {
      const existingUser = {
        id: 'user2',
        username: 'existinguser',
        credentials: [{ id: 'cred1_base64', publicKey: new Uint8Array(), counter: 0, deviceType: 'singleDevice', backedUp: false, transports: ['usb'] }]
      };
      const mockOptions = { challenge: 'existing_challenge', user: { id: 'user2' } };
      vi.mocked(generateRegistrationOptions).mockResolvedValue(mockOptions);
      mockUserStore.getUser.mockReturnValue(existingUser);

      const event = createMockRequestEvent({ username: 'existinguser' }) as RequestEvent;
      await registerStartPOST(event);

      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          userID: 'user2',
          excludeCredentials: [{ id: 'cred1_base64', type: 'public-key', transports: ['usb'] }],
        })
      );
    });
  });

  // --- /auth/register/finish ---
  describe('/auth/register/finish', () => {
    const mockRegResponseJSON: RegistrationResponseJSON = {
      id: 'credId_base64',
      rawId: 'credId_base64', // Should be different but for mock, fine
      response: { clientDataJSON: 'clientData', attestationObject: 'attestationObj' },
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'cross-platform',
    };

    it('should verify and store a new credential', async () => {
      const userId = 'user1';
      const user = { id: userId, username: 'testuser', credentials: [] };
      const registrationInfo = {
        credentialID: Uint8Array.from(Buffer.from('credId_base64', 'base64url')), // raw id
        credentialPublicKey: new Uint8Array([1, 2, 3]),
        counter: 1,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      };
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({ verified: true, registrationInfo });
      mockUserStore.getUserById.mockReturnValue(user);
      mockChallengeStore.getChallenge.mockReturnValue('challenge_to_verify');

      const event = createMockRequestEvent({ ...mockRegResponseJSON, userId }) as RequestEvent;
      const response = await registerFinishPOST(event);
      const jsonResponse = await response.json();

      expect(mockChallengeStore.getChallenge).toHaveBeenCalledWith(userId);
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          response: { ...mockRegResponseJSON, userId }, // Ensure userId is part of the expected response object
          expectedChallenge: 'challenge_to_verify',
          expectedOrigin: 'http://test.com',
          expectedRPID: 'test.com',
        })
      );
      expect(mockUserStore.addCredentialToUser).toHaveBeenCalledWith(userId, expect.objectContaining({
        id: 'credId_base64',
        publicKey: registrationInfo.credentialPublicKey,
        counter: 1,
      }));
      expect(mockChallengeStore.clearChallenge).toHaveBeenCalledWith(userId);
      expect(jsonResponse.verified).toBe(true);
    });

    it('should return error if verification fails', async () => {
      const userId = 'user1';
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({ verified: false });
      mockUserStore.getUserById.mockReturnValue({ id: userId, username: 'test', credentials: [] });
      mockChallengeStore.getChallenge.mockReturnValue('challenge1');
      const event = createMockRequestEvent({ ...mockRegResponseJSON, userId }) as RequestEvent;

      try {
        await registerFinishPOST(event);
        expect.fail('Should have thrown an error');
      } catch (e: any) {
        expect(e.status).toBe(400);
        // Assuming SvelteKit's error() helper populates a 'body' property on the thrown error for JSON content
        // or that the error object itself is the body if not an HttpError instance.
        // For HttpError, the 'message' property of the error object itself is usually the one.
        expect(e.body.message || e.message).toBe('Registration verification failed.');
      }
      expect(mockUserStore.addCredentialToUser).not.toHaveBeenCalled();
      expect(mockChallengeStore.clearChallenge).toHaveBeenCalledWith(userId);
    });
  });

  // --- /auth/login/start ---
  describe('/auth/login/start', () => {
    it('should generate auth options without username (discoverable)', async () => {
      const mockOptions = { challenge: 'login_challenge_disco' };
      vi.mocked(generateAuthenticationOptions).mockResolvedValue(mockOptions);

      const event = createMockRequestEvent({}) as RequestEvent; // No username
      await loginStartPOST(event);

      expect(generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({ rpID: 'test.com', allowCredentials: undefined })
      );
      expect(mockChallengeStore.storeChallenge).toHaveBeenCalledWith('currentLoginChallenge', 'login_challenge_disco');
    });

     it('should generate auth options with username and allowCredentials', async () => {
      const user = {
        id: 'user3',
        username: 'loginuser',
        credentials: [{ id: 'cred2_base64', publicKey: new Uint8Array(), counter: 1, deviceType: 'single', backedUp: true, transports: ['internal'] }]
      };
      const mockOptions = { challenge: 'login_challenge_user' };
      vi.mocked(generateAuthenticationOptions).mockResolvedValue(mockOptions);
      mockUserStore.getUser.mockReturnValue(user);

      const event = createMockRequestEvent({ username: 'loginuser' }) as RequestEvent;
      await loginStartPOST(event);

      expect(generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'test.com',
          allowCredentials: [{ id: 'cred2_base64', type: 'public-key', transports: ['internal'] }],
        })
      );
      expect(mockChallengeStore.storeChallenge).toHaveBeenCalledWith('user3', 'login_challenge_user');
    });
  });

  // --- /auth/login/finish ---
  describe('/auth/login/finish', () => {
    const mockAuthResponseJSON: AuthenticationResponseJSON = {
      id: 'credId_base64', // credential ID used for login
      rawId: 'credId_base64',
      response: {
        clientDataJSON: 'clientData',
        authenticatorData: 'authData',
        signature: 'sig',
        userHandle: 'user1', // This is the user ID
      },
      type: 'public-key',
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };

    let userForLogin: User;

    beforeEach(() => { // This beforeEach is for the '/auth/login/finish' describe block
      // Reset userForLogin before each test in this block to ensure counter is fresh
      userForLogin = {
        id: 'user1',
        username: 'verifieduser',
        credentials: [{
          id: 'credId_base64',
          publicKey: new Uint8Array([4,5,6]),
          counter: 0, // Initial counter
          deviceType: 'single',
          backedUp: true,
          transports: ['usb']
        }]
      };
    });

    it('should verify login, update counter, and set session cookie', async () => {
      const authenticationInfo = {
        newCounter: userForLogin.credentials[0].counter + 1, // Expected new counter
        credentialID: Buffer.from(userForLogin.credentials[0].id, 'base64url')
      };
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: true, authenticationInfo });
      mockUserStore.getUserById.mockReturnValue(userForLogin);
      mockChallengeStore.getChallenge.mockReturnValue('login_challenge_verify');

      const event = createMockRequestEvent(mockAuthResponseJSON) as RequestEvent;
      const response = await loginFinishPOST(event);
      const jsonResponse = await response.json();

      expect(mockUserStore.getUserById).toHaveBeenCalledWith('user1');
      expect(mockChallengeStore.getChallenge).toHaveBeenCalledWith('user1');
      expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          response: mockAuthResponseJSON,
          expectedChallenge: 'login_challenge_verify',
          authenticator: expect.objectContaining({ // Use ObjectContaining for authenticator
            credentialID: expect.any(Uint8Array), // Key check: was derived from id
            publicKey: userForLogin.credentials[0].publicKey,
            counter: userForLogin.credentials[0].counter, // Expect original counter (0)
            // Not checking all fields like deviceType, backedUp, transports unless critical
          }),
        })
      );
      // Check that the counter in the store was updated (simulated by direct mutation in this test)
      const updatedUserInStore = mockUserStore.getUserById(userForLogin.id);
      expect(updatedUserInStore?.credentials[0].counter).toBe(authenticationInfo.newCounter);

      expect(mockSessionStore.setSession).toHaveBeenCalledWith('mocked-uuid', 'user1', expect.any(Number));
      expect(event.cookies.set).toHaveBeenCalledWith('sessionid', 'mocked-uuid', expect.any(Object));
      expect(mockChallengeStore.clearChallenge).toHaveBeenCalled(); // Called with user.id or generic key
      expect(jsonResponse.verified).toBe(true);
      expect(jsonResponse.user.username).toBe('verifieduser');
    });

    it('should fail if userHandle is missing', async () => {
      const event = createMockRequestEvent({ ...mockAuthResponseJSON, response: { ...mockAuthResponseJSON.response, userHandle: undefined }}) as RequestEvent;
      try {
        await loginFinishPOST(event); expect.fail('Should throw');
      } catch (e:any) {
        expect(e.status).toBe(400); expect(e.body.message || e.message).toContain('UserHandle (userId) is missing');
      }
    });

    it('should fail if user not found for userHandle', async () => {
      mockUserStore.getUserById.mockReturnValue(undefined);
      const event = createMockRequestEvent(mockAuthResponseJSON) as RequestEvent;
      try {
        await loginFinishPOST(event); expect.fail('Should throw');
      } catch (e:any) {
        expect(e.status).toBe(404); expect(e.body.message || e.message).toContain('User not found');
      }
    });

    it('should fail if credential not found for user', async () => {
      const userWithNoMatchingCreds = { ...userForLogin, credentials: [ { ...userForLogin.credentials[0], id: "otherCredId"}] };
      mockUserStore.getUserById.mockReturnValue(userWithNoMatchingCreds);
      mockChallengeStore.getChallenge.mockReturnValue('some-challenge');
      const event = createMockRequestEvent(mockAuthResponseJSON) as RequestEvent;
      try {
        await loginFinishPOST(event); expect.fail('Should throw');
      } catch (e:any) {
        expect(e.status).toBe(404); expect(e.body.message || e.message).toContain('Credential not found');
      }
    });

    it('should fail if challenge is missing', async () => {
      mockUserStore.getUserById.mockReturnValue(userForLogin);
      mockChallengeStore.getChallenge.mockReturnValue(undefined);
      const event = createMockRequestEvent(mockAuthResponseJSON) as RequestEvent;
      try {
        await loginFinishPOST(event); expect.fail('Should throw');
      } catch (e:any) {
        expect(e.status).toBe(400); expect(e.body.message || e.message).toContain('Challenge not found');
      }
    });

    it('should fail if verifyAuthenticationResponse returns verified: false', async () => {
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: false, authenticationInfo: null as any });
      mockUserStore.getUserById.mockReturnValue(userForLogin);
      mockChallengeStore.getChallenge.mockReturnValue('login_challenge_verify');
      const event = createMockRequestEvent(mockAuthResponseJSON) as RequestEvent;
      try {
        await loginFinishPOST(event); expect.fail('Should throw');
      } catch (e:any) {
        expect(e.status).toBe(400);
        expect(e.body.message || e.message).toContain('Authentication verification failed');
      }
      expect(mockChallengeStore.clearChallenge).toHaveBeenCalled();
    });
  });

  // --- /auth/logout ---
  describe('/auth/logout', () => {
    it('should clear session and cookie', async () => {
      const event = createMockRequestEvent({}, { 'sessionid': 'session123' }) as RequestEvent;
      const response = await logoutPOST(event);
      const jsonResponse = await response.json();

      expect(mockSessionStore.deleteSession).toHaveBeenCalledWith('session123');
      expect(event.cookies.delete).toHaveBeenCalledWith('sessionid', { path: '/' });
      expect(jsonResponse.success).toBe(true);
    });

    it('should do nothing if no session cookie present', async () => {
      const event = createMockRequestEvent({}) as RequestEvent; // No session cookie
      await logoutPOST(event);
      expect(mockSessionStore.deleteSession).not.toHaveBeenCalled();
      expect(event.cookies.delete).not.toHaveBeenCalled();
    });
  });
});

// Helper to convert Base64URL to Uint8Array for tests if needed, not used above but good for reference
// function base64UrlToUint8Array(base64Url: string): Uint8Array {
//   const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
//   const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
//   const rawData = atob(base64);
//   const outputArray = new Uint8Array(rawData.length);
//   for (let i = 0; i < rawData.length; ++i) {
//     outputArray[i] = rawData.charCodeAt(i);
//   }
//   return outputArray;
// }
