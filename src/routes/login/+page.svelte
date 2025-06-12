<script lang="ts">
  import { onMount } from 'svelte';
  import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
  import type { AuthenticationResponseJSON } from '@simplewebauthn/types';

  let username: string = ''; // Optional username
  let message: string = '';
  let messageType: 'success' | 'error' | 'info' = 'info';
  let isSupported: boolean = true;
  let isLoading: boolean = false;
  let loggedInUser: string | null = null;

  onMount(async () => {
    if (!browserSupportsWebAuthn()) {
      message = 'WebAuthn is not supported in this browser.';
      messageType = 'error';
      isSupported = false;
    }
  });

  async function handleLogin() {
    isLoading = true;
    message = 'Processing...';
    messageType = 'info';
    loggedInUser = null;

    try {
      // 1. Get authentication options from the server
      const startRequestBody: { username?: string } = {};
      if (username.trim()) {
        startRequestBody.username = username.trim();
      }

      const startResponse = await fetch('/auth/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startRequestBody),
      });

      const startData = await startResponse.json();

      if (!startResponse.ok) {
        // Attempt to parse error message from server, default if not available
        const serverMessage = startData.message || (startData.error ? startData.error.message : null);
        throw new Error(serverMessage || `Failed to start login: ${startResponse.status}`);
      }

      // 2. Call startAuthentication() with the options
      let authResp: AuthenticationResponseJSON;
      try {
        // Check if options contain allowCredentials and if it's empty
        // This can happen if username was provided but no credentials found.
        // SimpleWebAuthn browser might throw an error if allowCredentials is an empty array.
        // It's better for it to be undefined or not present if no specific credentials are to be allowed.
        // The /auth/login/start endpoint already handles this by setting allowCredentials to undefined
        // if user has no credentials or no username is given.
        if (startData.allowCredentials && startData.allowCredentials.length === 0) {
          // If server explicitly sends empty allowCredentials, it implies user has no registered keys.
          // We could throw an error here, or let startAuthentication handle it.
          // For a better UX, we can inform the user.
          throw new Error(`No passkeys found for user "${username}". Please register first.`);
        }
        authResp = await startAuthentication(startData);
      } catch (err: any) {
        // Handle browser-side errors (e.g., user cancellation, authenticator issues)
         if (err.name === 'NotAllowedError') {
            throw new Error('Login cancelled or no matching passkey found/selected.');
        }
        throw new Error(`Login failed or cancelled: ${err.message || err.name}`);
      }

      // 3. Send the authentication response to the server for verification
      const finishResponse = await fetch('/auth/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp), // Server extracts userId from userHandle in authResp
      });

      const finishData = await finishResponse.json();

      if (!finishResponse.ok) {
        throw new Error(finishData.message || `Failed to finish login: ${finishResponse.status}`);
      }

      if (finishData.verified && finishData.user) {
        loggedInUser = finishData.user.username;
        message = `Login successful! Welcome, ${loggedInUser}!`;
        messageType = 'success';
        username = ''; // Clear username field
        // TODO: Implement session management (e.g., set a cookie, update a store, redirect)
      } else {
        throw new Error(finishData.message || 'Login verification failed.');
      }
    } catch (err: any) {
      message = err.message || 'An unknown error occurred during login.';
      messageType = 'error';
      console.error('Login error:', err);
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Login - WebAuthn</title>
</svelte:head>

<div class="container">
  <h1>Login with Passkey</h1>

  {#if !isSupported}
    <p class="message error">{message}</p>
  {:else if loggedInUser}
    <p class="message success">{message}</p>
    <button on:click={() => { loggedInUser = null; message = ''; username = ''; }}>Log out (Clear Message)</button>
  {:else}
    <form on:submit|preventDefault={handleLogin}>
      <div>
        <label for="username">Username (optional, for non-discoverable passkeys):</label>
        <input type="text" id="username" bind:value={username} disabled={isLoading} placeholder="Leave blank for discoverable passkeys" />
      </div>
      <button type="submit" disabled={isLoading}>
         {#if isLoading}Logging In...{:else}Login with Passkey{/if}
      </button>
    </form>
    {#if message}
      <p class="message {messageType}">{message}</p>
    {/if}
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
    margin-top: 1rem;
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
