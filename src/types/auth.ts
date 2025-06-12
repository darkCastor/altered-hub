/**
 * Represents a user in the system.
 */
export interface User {
  id: string; // Unique identifier for the user (e.g., UUID)
  username: string; // User's chosen username, must be unique
  credentials: Credential[]; // List of credentials associated with the user
}

/**
 * Represents a WebAuthn credential.
 * This structure is based on the information returned by SimpleWebAuthn's verifyRegistrationResponse
 * and is intended for storage in the database.
 */
export interface Credential {
  id: string; // Credential ID (Base64URLString, from authenticator.credentialID)
  publicKey: Uint8Array; // The COSE public key
  counter: number; // Signature counter
  transports?: AuthenticatorTransport[]; // Optional: Transports available for the authenticator
  backedUp: boolean; // Whether the credential is backed up
  deviceType: string; // Type of authenticator e.g. 'singleDevice' or 'multiDevice'
  // algorithms?: COSEAlgorithmIdentifier[]; // COSEAlgorithmIdentifier[] is number[]
  // We will store COSE algorithm identifiers as numbers, e.g. [-7, -257]
  // For now, this is not returned by verifyRegistrationResponse directly in this form,
  // but it's good to keep in mind for potential future storage if needed.
  // It's part of the credential's attestation object, but not directly in RegistrationInfo.
  // SimpleWebAuthn handles algorithm compatibility internally based on the public key.
}

// Helper type for PublicKeyCredentialDescriptor, used in excludeCredentials
// This is what SimpleWebAuthn expects for excluding credentials.
export interface PublicKeyCredentialDescriptor {
  id: string; // Base64URL encoded credential ID
  type: 'public-key';
  transports?: AuthenticatorTransport[];
}
