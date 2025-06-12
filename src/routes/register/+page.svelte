<script lang="ts">
  import { onMount } from 'svelte';
  import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
  import type { RegistrationResponseJSON } from '@simplewebauthn/types';

  let username: string = '';
  let message: string = '';
  let messageType: 'success' | 'error' | 'info' = 'info'; // For styling messages
  let isSupported: boolean = true;
  let isLoading: boolean = false;
  let registrationOptionsUserId: string | null = null; // To store user.id from start options

  onMount(async () => {
    if (!browserSupportsWebAuthn()) {
      message = 'WebAuthn is not supported in this browser.';
      messageType = 'error';
      isSupported = false;
    }
  });

  async function handleRegister() {
    if (!username.trim()) {
      message = 'Please enter a username.';
      messageType = 'error';
      return;
    }

    isLoading = true;
    message = 'Processing...';
    messageType = 'info';

    try {
      // 1. Get registration options from the server
      const startResponse = await fetch('/auth/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const startData = await startResponse.json();

      if (!startResponse.ok) {
        throw new Error(startData.message || `Failed to start registration: ${startResponse.status}`);
      }

      // Store the user.id from the options. This is crucial for the finish step.
      // The options object from @simplewebauthn/server contains a `user` object with `id`.
      if (startData && startData.user && startData.user.id) {
        registrationOptionsUserId = startData.user.id;
      } else {
        // Fallback or error if user.id is not in the expected place
        // This might happen if the server's response structure is different.
        // For this implementation, we expect `startData.user.id`.
        // If it's directly on startData.userId (less common for raw options), adjust accordingly.
        // The current /auth/register/start returns the options directly,
        // and these options include a `user` object with `id`, `name`, `displayName`.
        console.warn("User ID not found in startData.user.id, checking startData.userID as a fallback from generateRegistrationOptions direct output structure");
        if (startData && startData.userID) {
             registrationOptionsUserId = startData.userID;
        } else {
            throw new Error('User ID missing in registration start options from server.');
        }
      }


      // 2. Call startRegistration() with the options
      let attResp: RegistrationResponseJSON;
      try {
        attResp = await startRegistration(startData);
      } catch (err: any) {
        // Handle browser-side errors (e.g., user cancellation, authenticator issues)
        if (err.name === 'InvalidStateError') {
          throw new Error('Authenticator was probably already registered. Try logging in.');
        }
        throw new Error(`Registration cancelled or failed: ${err.message || err.name}`);
      }

      // 3. Send the attestation response to the server for verification
      // We need to send the original `userId` that was used to generate the challenge.
      if (!registrationOptionsUserId) {
        throw new Error('User ID for finishing registration is missing. Cannot proceed.');
      }

      const finishResponse = await fetch('/auth/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the attestation response AND the userId from the start options
        body: JSON.stringify({ ...attResp, userId: registrationOptionsUserId }),
      });

      const finishData = await finishResponse.json();

      if (!finishResponse.ok) {
        throw new Error(finishData.message || `Failed to finish registration: ${finishResponse.status}`);
      }

      if (finishData.verified) {
        message = `Registration successful for ${username}! You can now try logging in.`;
        messageType = 'success';
        username = ''; // Clear username field
      } else {
        throw new Error(finishData.message || 'Registration verification failed.');
      }
    } catch (err: any) {
      message = err.message || 'An unknown error occurred during registration.';
      messageType = 'error';
      console.error('Registration error:', err);
    } finally {
      isLoading = false;
      registrationOptionsUserId = null; // Clear after attempt
    }
  }
</script>

<svelte:head>
  <title>Register - WebAuthn</title>
</svelte:head>

<div class="container">
  <h1>Register New User</h1>

  {#if !isSupported}
    <p class="message error">{message}</p>
  {:else}
    <form on:submit|preventDefault={handleRegister}>
      <div>
        <label for="username">Username:</label>
        <input type="text" id="username" bind:value={username} required disabled={isLoading} />
      </div>
      <button type="submit" disabled={isLoading}>
         {#if isLoading}Registering...{:else}Register with Passkey{/if}
      </button>
    </form>
  {/if}

  {#if message && isSupported}
    <p class="message {messageType}">{message}</p>
  {/if}
</div>

<style>
  .container {
    max-width: 500px;
    margin: 2rem auto;
    padding: 2rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-family: sans-serif;
  }
  h1 {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  label {
    display: block;
    margin-bottom: 0.5rem;
  }
  input[type="text"] {
    width: 100%;
    padding: 0.5rem;
    margin-bottom: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
  }
  button {
    display: block;
    width: 100%;
    padding: 0.75rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }
  button:disabled {
    background-color: #aaa;
  }
  .message {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 4px;
    text-align: center;
  }
  .success {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  .error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
  .info {
    background-color: #d1ecf1;
    color: #0c5460;
    border: 1px solid #bee5eb;
  }
</style>
