import type { AuthenticatorDevice } from '@simplewebauthn/server/script/deps';
import type { User, Credential } from '../types/auth';

// In-memory store for users
const users = new Map<string, User>();
// In-memory store for challenges
const challenges = new Map<string, string>();

export const devUserStore = {
  getUser: (username: string): User | undefined => {
    return users.get(username);
  },
  createUser: (username: string): User => {
    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      username,
      credentials: []
    };
    users.set(username, newUser);
    return newUser;
  },
  addCredentialToUser: (userId: string, credential: Credential): void => {
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (user) {
      user.credentials.push(credential);
    }
  },
  getUserById: (userId: string): User | undefined => {
    return Array.from(users.values()).find(u => u.id === userId);
  }
};

export const devChallengeStore = {
  storeChallenge: (userId: string, challenge: string): void => {
    challenges.set(userId, challenge);
  },
  getChallenge: (userId: string): string | undefined => {
    return challenges.get(userId);
  },
  clearChallenge: (userId: string): void => {
    challenges.delete(userId);
  }
};

// Helper type for SimpleWebAuthn, can be moved to a more appropriate file later
export interface WebAuthnCredential extends AuthenticatorDevice {
  id: string; // Base64URLString
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransport[];
}
// Ensure AuthenticatorDevice is correctly typed if it's being extended
// For now, we'll assume it has the necessary properties like credentialID, credentialPublicKey etc.
// or that they will be mapped correctly in the /finish endpoint.
// The actual SimpleWebAuthn AuthenticatorDevice type might differ.
// We are using 'id' for credentialID for simplicity in our Credential type.
// publicKey is Uint8Array, counter is number.
// transports is optional.
// backedUp is boolean.
// We'll refine this as we implement the /finish endpoint.
// For now, this is a basic structure.
// The Credential type in types/auth.ts will be the canonical one.
// This one is more of a placeholder for what SimpleWebAuthn expects/returns.
// It seems I've duplicated some of the credential definition here and in the types/auth.ts plan.
// I will primarily use the one in types/auth.ts.
// Let's make Credential in devAuthStore.ts simpler for now and ensure it's compatible.
// This file is for temporary dev storage, so the exact structure of stored credential can be flexible
// as long as it holds the necessary info for excludeCredentials.
// The primary source of truth for credential structure will be in `types/auth.ts`
// and the actual storage implementation later.

// Example of how credentials might be structured for excludeCredentials:
// {
//   id: credentialIDAsBase64URLString,
//   type: 'public-key',
//   transports: authenticator.transports, // Optional
// }
// We will store the full credential info from registrationInfo in our main credential store.
// For excludeCredentials, only 'id', 'type', and 'transports' are needed.
// Our `Credential` type in `types/auth.ts` will be more comprehensive.
// The `credentials` array in the `User` object in this store will hold objects
// that conform to the `PublicKeyCredentialDescriptor` interface expected by `excludeCredentials`.
// For now, `user.credentials` will store the `Credential` type from `types/auth.ts`.
// We will adapt it when calling `generateRegistrationOptions`.
// The `WebAuthnCredential` interface above is more aligned with `registrationInfo`.
// Let's simplify and stick to the `Credential` type from `types/auth.ts`.
// This `WebAuthnCredential` interface can be removed or refined later.
// For `excludeCredentials`, it expects `PublicKeyCredentialDescriptor[]`.
// `PublicKeyCredentialDescriptor` has `id` (base64url), `type` ('public-key'), and optionally `transports`.
// Our `Credential` type in `types/auth.ts` will be the one we store.
// We will map it to `PublicKeyCredentialDescriptor` when calling `generateRegistrationOptions`.

// In-memory store for sessions
interface SessionData {
  userId: string;
  expires: Date;
}
const sessions = new Map<string, SessionData>();

export const devSessionStore = {
  setSession: (sessionId: string, userId: string, expiresInMs: number): void => {
    const expires = new Date(Date.now() + expiresInMs);
    sessions.set(sessionId, { userId, expires });
  },
  getSession: (sessionId: string): SessionData | undefined => {
    const session = sessions.get(sessionId);
    if (session) {
      if (session.expires > new Date()) {
        return session;
      } else {
        sessions.delete(sessionId); // Clean up expired session
      }
    }
    return undefined;
  },
  deleteSession: (sessionId: string): void => {
    sessions.delete(sessionId);
  },
  // For cleanup or admin purposes, not directly used by app logic yet
  getAllSessions: () => sessions,
};
