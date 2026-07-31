<script lang="ts">
  import { websocketStore, connectionStatus, connectionError, isConnecting } from '../stores/websocketStore';
  import { navigate } from 'svelte-routing';
  import ErrorNotification from './ErrorNotification.svelte';

  const WEBSOCKET_BASE_URL = `ws://localhost:8000`;

  // Validation constants (matching backend)
  const MIN_PLAYER_NAME_LENGTH = 1;
  const MAX_PLAYER_NAME_LENGTH = 32;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 10;
  const PLAYER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

  export let title: string;
  export let endpoint: string;
  export let playerName: string;
  export let roomId: string | null = null;
  export let numPlayers: number | null = null;
  export let queryParams: string;

  // Track whether fields should be shown based on initial props
  const showRoomId = roomId !== null;
  const showNumPlayers = numPlayers !== null;

  let validationError: string | null = null;
  let isSubmitting = false;

  // Validate player name
  function validatePlayerName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return 'Player name is required';
    }
    if (name.length < MIN_PLAYER_NAME_LENGTH) {
      return `Player name must be at least ${MIN_PLAYER_NAME_LENGTH} character`;
    }
    if (name.length > MAX_PLAYER_NAME_LENGTH) {
      return `Player name must be at most ${MAX_PLAYER_NAME_LENGTH} characters`;
    }
    if (!PLAYER_NAME_REGEX.test(name)) {
      return 'Player name can only contain letters, numbers, underscores, and hyphens';
    }
    return null;
  }

  // Validate room ID
  function validateRoomId(id: string | null): string | null {
    if (!showRoomId) return null; // Not required for create

    if (!id || id.trim().length === 0) {
      return 'Room code is required';
    }
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return 'Room code must be a number';
    }
    if (numId < 1000 || numId > 9999) {
      return 'Room code must be between 1000 and 9999';
    }
    return null;
  }

  // Validate number of players
  function validateNumPlayers(num: number | null): string | null {
    if (!showNumPlayers) return null; // Not required for join

    if (num === null || num === undefined) {
      return 'Number of players is required';
    }
    if (num < MIN_PLAYERS) {
      return `Minimum ${MIN_PLAYERS} players required`;
    }
    if (num > MAX_PLAYERS) {
      return `Maximum ${MAX_PLAYERS} players allowed`;
    }
    return null;
  }

  // Validate all fields
  function validateForm(): string | null {
    const nameError = validatePlayerName(playerName);
    if (nameError) return nameError;

    const roomError = validateRoomId(roomId);
    if (roomError) return roomError;

    const playersError = validateNumPlayers(numPlayers);
    if (playersError) return playersError;

    return null;
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    validationError = null;

    // Validate form
    const error = validateForm();
    if (error) {
      validationError = error;
      return;
    }

    isSubmitting = true;

    const websocketUrl = `${WEBSOCKET_BASE_URL}/${endpoint}?${queryParams}`;
    console.log('Connecting to WebSocket:', websocketUrl);

    try {
      await websocketStore.connect(websocketUrl);
      // Connection successful, navigate to game
      navigate('/game');
    } catch (err) {
      // Error is already stored in websocketStore
      console.error('Connection failed:', err);
      isSubmitting = false;
    }
  }

  function clearValidationError() {
    validationError = null;
  }

  // Clear validation error when inputs change
  $: if (playerName || roomId || numPlayers) {
    validationError = null;
  }
</script>

<style>
  body, html {
    height: 100%;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #f3f3f3;
  }

  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .nes-container {
    max-width: 400px;
    padding: 1.5em;
    border-radius: 1em;
    background-color: white;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: auto;
  }

  .title {
    font-size: 1.5em;
    margin-bottom: 1em;
    text-align: center;
  }

  .nes-field {
    margin-bottom: 1.5em;
    width: 100%;
  }

  form {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  input {
    width: 100%;
  }

  button {
    margin-top: 1em;
  }

  button:hover:not(:disabled) {
    background-color: #0056b3;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .validation-error {
    color: #ce372b;
    font-size: 12px;
    margin-top: 4px;
    text-align: center;
  }

  .field-error {
    border-color: #ce372b !important;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 1em;
    font-size: 12px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }

  .status-dot.connecting {
    background-color: #f7d51d;
  }

  .status-dot.error {
    background-color: #ce372b;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .input-hint {
    font-size: 10px;
    color: #666;
    margin-top: 4px;
  }
</style>

<ErrorNotification />

<div class="container">
  <div class="nes-container with-title">
    <form on:submit={handleSubmit}>
      <p class="title">{title}</p>

      <div class="nes-field">
        <label for="playerName">Player Name:</label>
        <input
          type="text"
          id="playerName"
          class="nes-input"
          class:field-error={validationError && validationError.includes('name')}
          bind:value={playerName}
          maxlength={MAX_PLAYER_NAME_LENGTH}
          disabled={$isConnecting}
          required
        />
        <p class="input-hint">Letters, numbers, underscores, hyphens only</p>
      </div>

      {#if showRoomId}
        <div class="nes-field">
          <label for="roomId">Room Code:</label>
          <input
            type="text"
            id="roomId"
            class="nes-input"
            class:field-error={validationError && validationError.includes('Room')}
            bind:value={roomId}
            maxlength="4"
            disabled={$isConnecting}
            required
          />
          <p class="input-hint">4-digit room code (1000-9999)</p>
        </div>
      {/if}

      {#if showNumPlayers}
        <div class="nes-field">
          <label for="numPlayers">Number of Players:</label>
          <input
            type="number"
            id="numPlayers"
            class="nes-input"
            class:field-error={validationError && validationError.includes('players')}
            bind:value={numPlayers}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            disabled={$isConnecting}
            required
          />
          <p class="input-hint">{MIN_PLAYERS}-{MAX_PLAYERS} players</p>
        </div>
      {/if}

      {#if validationError}
        <p class="validation-error">{validationError}</p>
      {/if}

      <button
        type="submit"
        class="nes-btn is-primary"
        disabled={$isConnecting}
      >
        {#if $isConnecting}
          Connecting...
        {:else}
          {title}
        {/if}
      </button>

      {#if $isConnecting}
        <div class="status-indicator">
          <span class="status-dot connecting"></span>
          <span>
            {$connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connecting to server...'}
          </span>
        </div>
      {/if}
    </form>
  </div>
</div>
