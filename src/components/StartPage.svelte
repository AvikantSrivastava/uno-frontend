<!-- Start.svelte -->

<script lang="ts">
  import { Link, navigate } from 'svelte-routing';
  import { onMount } from 'svelte';
  import { websocketStore, isConnecting, connectionStatus } from '../stores/websocketStore';

  const WEBSOCKET_BASE_URL = `ws://localhost:8000`;

  interface SavedSession {
    playerName: string;
    roomId: number;
    timestamp: number;
  }

  let savedSession: SavedSession | null = null;
  let reconnecting = false;
  let reconnectError: string | null = null;

  // Session expires after 24 hours
  const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

  onMount(() => {
    const sessionData = localStorage.getItem('uno_session');
    if (sessionData) {
      try {
        const session: SavedSession = JSON.parse(sessionData);
        // Check if session is still valid (not expired)
        if (Date.now() - session.timestamp < SESSION_EXPIRY_MS) {
          savedSession = session;
        } else {
          // Session expired, clear it
          localStorage.removeItem('uno_session');
        }
      } catch (e) {
        // Invalid session data, clear it
        localStorage.removeItem('uno_session');
      }
    }
  });

  async function handleReconnect() {
    if (!savedSession) return;

    reconnecting = true;
    reconnectError = null;

    const websocketUrl = `${WEBSOCKET_BASE_URL}/join?room_id=${savedSession.roomId}&player_name=${savedSession.playerName}`;
    console.log('Reconnecting to:', websocketUrl);

    try {
      await websocketStore.connect(websocketUrl);
      navigate('/uno/game');
    } catch (err: any) {
      reconnectError = err?.message || 'Failed to reconnect';
      reconnecting = false;
      // Clear invalid session
      localStorage.removeItem('uno_session');
      savedSession = null;
    }
  }

  function clearSession() {
    localStorage.removeItem('uno_session');
    savedSession = null;
  }
</script>

<div class="container">
  <h1 class="title">Uno Multiplayer Game</h1>

  {#if savedSession}
    <div class="session-card">
      <p class="session-info">
        You were playing as <strong>{savedSession.playerName}</strong> in room <strong>{savedSession.roomId}</strong>
      </p>
      {#if reconnectError}
        <p class="error-text">{reconnectError}</p>
      {/if}
      <button
        class="nes-btn is-warning reconnect-btn"
        on:click={handleReconnect}
        disabled={reconnecting}
      >
        {reconnecting ? 'Reconnecting...' : 'Rejoin Game'}
      </button>
      <button class="nes-btn dismiss-btn" on:click={clearSession}>
        Start Fresh
      </button>
    </div>
    <div class="divider">or</div>
  {/if}

  <Link class="nes-btn is-primary button" to="/uno/create-room" style="margin-bottom: 20px;">
    Create Room
  </Link>
  <Link class="nes-btn is-success button" to="/uno/join-room">
    Join Room
  </Link>
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    text-align: center;
  }

  .title {
    margin-bottom: 20px;
  }

  .button {
    margin: 10px 0;
  }

  .session-card {
    background: #fff;
    border: 4px solid #212529;
    padding: 20px;
    margin-bottom: 20px;
    max-width: 350px;
    text-align: center;
  }

  .session-info {
    margin-bottom: 15px;
    font-size: 14px;
  }

  .session-info strong {
    color: #209cee;
  }

  .reconnect-btn {
    display: block;
    width: 100%;
    margin-bottom: 10px;
  }

  .dismiss-btn {
    display: block;
    width: 100%;
    font-size: 12px;
  }

  .divider {
    color: #666;
    font-size: 14px;
    margin: 15px 0;
  }

  .error-text {
    color: #ce372b;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .reconnect-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
