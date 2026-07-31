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

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const websocketUrl = `${WEBSOCKET_BASE_URL}/${endpoint}?${queryParams}`;
    console.log('Connecting to WebSocket:', websocketUrl);
    connectWebSocket(websocketUrl);
    navigate('/uno/game');
  };
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
      margin: auto; /* Ensure the container is centered */
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

    button:hover {
      background-color: #0056b3;
    }
  </style>

<div class="container">
  <div class="nes-container with-title">
    <form on:submit={handleSubmit}>
      <p class="title">{title}</p>
      <div class="nes-field">
        <label for="playerName">Player Name:</label>
        <input type="text" id="playerName" class="nes-input" bind:value={playerName} required />
      </div>
      {#if roomId !== null}
        <div class="nes-field">
          <label for="roomId">Room Code:</label>
          <input type="text" id="roomId" class="nes-input" bind:value={roomId} required />
        </div>
      {/if}
      {#if numPlayers !== null}
        <div class="nes-field">
          <label for="numPlayers">Number of Players:</label>
          <input type="number" id="numPlayers" class="nes-input" bind:value={numPlayers} required />
        </div>
      {/if}
      <button type="submit" class="nes-btn is-primary">{title}</button>
    </form>
  </div>
</div>
