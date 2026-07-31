<!-- Game.svelte -->

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { navigate } from "svelte-routing";
  import "nes.css/css/nes.min.css";

  import {
    websocket,
    websocketStore,
    connectionStatus,
    connectionError,
    isConnected
  } from "../stores/websocketStore";
  import ErrorNotification from "./ErrorNotification.svelte";
  import type { Card, Player, Game, Room, GameState, ConnectionDTO, InfoDTO, PlayerInfo, CardStatus, WinnerDTO } from "../models";

  // Game state
  let gameState: { player: Player; room: Room; game: Game } | null = null;
  let connectionDTO: ConnectionDTO['obj'] | null = null;
  let infoDTO: InfoDTO['obj'] | null = null;
  let connectedPlayers: number = 0;

  // Game over state
  let gameOver: boolean = false;
  let isWinner: boolean = false;
  let winnerName: string = '';

  // Heartbeat
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let lastPongTime: number = Date.now();
  const PING_INTERVAL_MS = 3000;
  const PONG_TIMEOUT_MS = 10000;

  // Toast notifications
  type Toast = { id: number; message: string; type: 'info' | 'error' | 'success' };
  let toasts: Toast[] = [];
  let toastId = 0;

  function addToast(message: string, type: 'info' | 'error' | 'success' = 'info') {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, 5000);
  }

  function dismissToast(id: number) {
    toasts = toasts.filter(t => t.id !== id);
  }

  // Error state
  let parseError: string | null = null;

  // Unsubscribe function
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // Check if we have a connection
    if (!$websocket && !$isConnected) {
      // No connection, redirect to home
      navigate('/');
      return;
    }

    unsubscribe = websocket.subscribe((socket) => {
      if (socket) {
        socket.onmessage = (event) => {
          try {
            const incomingData = JSON.parse(event.data);
            parseError = null;

            switch (incomingData.type) {
              case "connection":
                connectionDTO = incomingData.obj;
                console.log("Connection", connectionDTO);
                // Set initial connected players count
                connectedPlayers = connectionDTO?.players?.length || 0;
                // Save session for reconnection
                if (connectionDTO?.player_name && connectionDTO?.room_id) {
                  localStorage.setItem('uno_session', JSON.stringify({
                    playerName: connectionDTO.player_name,
                    roomId: connectionDTO.room_id,
                    timestamp: Date.now()
                  }));
                }
                break;
              case "pong":
                lastPongTime = Date.now();
                connectedPlayers = incomingData.obj?.connected_players || connectedPlayers;
                break;
              case "info":
                infoDTO = incomingData.obj;
                if (infoDTO?.Message) {
                  addToast(infoDTO.Message, 'info');
                }
                console.log("INFO", infoDTO);
                break;
              case "sync":
                gameState = incomingData.obj;
                break;
              case "error":
                // Handle server-sent errors
                const errorMsg = incomingData.obj?.message || incomingData.obj?.Message || "Server error";
                addToast(errorMsg, 'error');
                break;
              case "game_over":
                // Handle game over
                gameOver = true;
                isWinner = incomingData.obj?.is_winner || false;
                winnerName = incomingData.obj?.winner_name || 'Unknown';
                console.log("Game Over!", isWinner ? "You won!" : `${winnerName} won!`);
                // Clear saved session since game is over
                localStorage.removeItem('uno_session');
                break;
              default:
                console.warn("Unknown message type:", incomingData.type);
            }
          } catch (err) {
            console.error("Failed to parse message:", err);
            parseError = "Failed to parse server message";
          }
        };
      }
    });

    // Subscribe to connection status for handling disconnects
    const statusUnsubscribe = connectionStatus.subscribe((status) => {
      if (status === 'disconnected' || status === 'error') {
        addToast("Connection lost. Attempting to reconnect...", 'error');
      } else if (status === 'connected') {
        addToast("Connected!", 'success');
      }
    });

    // Listen for browser online/offline events
    const handleOffline = () => {
      addToast("You're offline. Check your internet connection.", 'error');
    };
    const handleOnline = () => {
      addToast("Back online! Reconnecting...", 'info');
      websocketStore.attemptReconnect();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Start heartbeat ping
    pingInterval = setInterval(() => {
      if ($isConnected) {
        websocketStore.sendMessage({ type: "PING", obj: {} });
      }
    }, PING_INTERVAL_MS);

    return () => {
      if (unsubscribe) unsubscribe();
      statusUnsubscribe();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (pingInterval) clearInterval(pingInterval);
    };
  });

  onDestroy(() => {
    // Clean up WebSocket and heartbeat when leaving the game
    if (pingInterval) clearInterval(pingInterval);
    websocketStore.disconnect();
  });

  function drawCard() {
    console.log("Draw card button clicked");

    const success = websocketStore.sendMessage({
      type: "DRAW_CARD",
      obj: {},
    });

    if (!success) {
      addToast("Failed to draw card - not connected", 'error');
    }
  }

  function playCard(card: Card, index: number, color: string | null = null) {
    console.log("Play card button clicked", card, color);

    const success = websocketStore.sendMessage({
      type: "PLAY_CARD",
      obj: {
        card_index: index,
        new_color: color,
      },
    });

    if (!success) {
      addToast("Failed to play card - not connected", 'error');
    }
  }

  function getCardImage(card: Card): string {
    if (card.Rank === "wild" || card.Rank === "draw_4") {
      return `assets/cards/${card.Rank}.svg`;
    } else {
      return `assets/cards/${card.Color}-${card.Rank}.svg`;
    }
  }

  function selectColor(card: Card, index: number, color: string) {
    console.log("Color selected:", color);
    playCard(card, index, color);
  }

  function handleLeaveGame() {
    // Clear saved session when player intentionally leaves
    localStorage.removeItem('uno_session');
    websocketStore.disconnect();
    navigate('/');
  }

  function handleReconnect() {
    websocketStore.attemptReconnect();
  }

  // Check if it's the current player's turn
  $: isMyTurn = gameState?.game?.turn === gameState?.player?.Name;

  // Rotating greeting (set once on mount)
  const greetings = ['Hi', 'Hey', 'Hello', 'Howdy'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  $: playerName = connectionDTO?.player_name || gameState?.player?.Name || 'Player';
  $: activePlayersCount = connectedPlayers || gameState?.room?.players?.length || connectionDTO?.players?.length || 0;

  // Card status display helper
  function getCardStatusLabel(status: CardStatus): string {
    switch (status) {
      case 'too_many': return '📚';
      case 'many': return '📖';
      case 'few': return '📄';
      case 'very_few': return '📃';
      case 'one': return '🔥';
      default: return '?';
    }
  }

  function getCardStatusTooltip(status: CardStatus): string {
    switch (status) {
      case 'too_many': return 'Too many cards (10+)';
      case 'many': return 'Many cards (7-9)';
      case 'few': return 'Few cards (4-6)';
      case 'very_few': return 'Very few cards (2-3)';
      case 'one': return 'UNO! (1 card)';
      default: return 'Unknown';
    }
  }
</script>

<ErrorNotification />

<!-- Toast notifications -->
<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <div class="toast toast-{toast.type}" on:click={() => dismissToast(toast.id)}>
      <span class="toast-message">{toast.message}</span>
      <button class="toast-close" on:click|stopPropagation={() => dismissToast(toast.id)}>×</button>
    </div>
  {/each}
</div>

<!-- Header -->
<header class="game-header">
  <div class="header-top">
    <div class="connection-status">
      <span class="status-dot" class:connected={$isConnected} class:disconnected={!$isConnected}></span>
      <span class="status-label">{$isConnected ? 'Connected' : 'Reconnecting...'}</span>
      {#if !$isConnected}
        <button class="reconnect-btn" on:click={handleReconnect}>Retry</button>
      {/if}
    </div>
    <button class="exit-btn" on:click={handleLeaveGame}>Exit</button>
  </div>

  <div class="header-main">
    <h1 class="greeting">{greeting}, <span class="player-name">{playerName}</span>!</h1>

    <div class="room-info">
      <div class="room-badge">
        <span class="room-label">ROOM CODE</span>
        <span class="room-code">{connectionDTO?.room_id || '----'}</span>
      </div>
      <div class="players-badge">
        <span class="players-count">{activePlayersCount}</span>
        <span class="players-label">players in room</span>
      </div>
    </div>
  </div>
</header>

<div class="container">

  <div class="bottom">
    {#if gameOver}
      <section class="game-over-container">
        <div class="game-over-content {isWinner ? 'winner' : 'loser'}">
          {#if isWinner}
            <div class="trophy">🏆</div>
            <h1 class="game-over-title winner-title">You Won!</h1>
            <p class="game-over-message">Congratulations! You played all your cards!</p>
          {:else}
            <div class="trophy">😔</div>
            <h1 class="game-over-title loser-title">{winnerName} Won!</h1>
            <p class="game-over-message">Better luck next time!</p>
          {/if}
          <button class="nes-btn is-primary play-again-btn" on:click={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </section>
    {:else if !$isConnected}
      <section class="box">
        <div class="nes-container is-rounded is-dark disconnected-notice">
          <p><i class="nes-icon is-medium heart is-empty"></i></p>
          <p>Connection lost!</p>
          <p>Trying to reconnect...</p>
          <button class="nes-btn is-primary" on:click={handleReconnect}>
            Reconnect Now
          </button>
        </div>
      </section>
    {:else if gameState}
      <section class="game-area">
        <div class="game-board">
          <div class="top-card-container">
              <div class="arrow-container">
                <img
                  src="assets/arrow.svg"
                  alt="arrow"
                  class="arrow"
                  style="transform: rotate({gameState?.game?.reverse ? 180 : 0}deg);"
                />
              </div>
              <table class="nes-table is-bordered is-centered players-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Cards</th>
                    <th>Turn</th>
                  </tr>
                </thead>
                <tbody>
                  {#each gameState?.room?.players || [] as player}
                    <tr class="{gameState?.game?.turn === player.name && gameState?.player?.Name === player.name ? 'client-turn' : ''} {player.is_uno ? 'uno-spotlight' : ''}">
                      <td class="{player.is_uno ? 'uno-name' : ''}">{player.name}</td>
                      <td title={getCardStatusTooltip(player.card_status)} class="card-status {player.card_status}">
                        {getCardStatusLabel(player.card_status)}
                      </td>
                      <td>
                        {#if gameState?.game?.turn === player.name}
                          <i class="nes-mario"></i>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <img
                src={getCardImage(gameState?.game?.topcard)}
                alt="{gameState?.game?.topcard?.Rank} {gameState?.game?.topcard?.Color}"
                class="top-card {gameState?.game?.topcolor}"
              />
              <button
                class="nes-btn"
                on:click={drawCard}
                disabled={!isMyTurn || !$isConnected}
              >
                Draw
              </button>
            </div>
            <div class="cards-section">
              <div style="margin-bottom: 40px;"></div>
              <h3 style="text-align: center;">
                Your Cards
                {#if isMyTurn}
                  <span class="your-turn-badge">YOUR TURN!</span>
                {/if}
              </h3>
              <div class="cards-container">
                {#each gameState?.player?.Cards || [] as card, index}
                  <div class="card-container">
                    <img
                      src={getCardImage(card)}
                      alt="{card.Rank} {card.Color}"
                      class="card"
                      class:disabled={!isMyTurn || !$isConnected}
                      on:click={() => isMyTurn && $isConnected && playCard(card, index)}
                    />
                    {#if card.Rank === "wild" || card.Rank === "draw_4"}
                      <div class="color-picker">
                        <button
                          class="color-sector sector-top"
                          on:click|stopPropagation={() => selectColor(card, index, 'red')}
                          disabled={!isMyTurn || !$isConnected}
                          title="Red"
                        ></button>
                        <button
                          class="color-sector sector-right"
                          on:click|stopPropagation={() => selectColor(card, index, 'yellow')}
                          disabled={!isMyTurn || !$isConnected}
                          title="Yellow"
                        ></button>
                        <button
                          class="color-sector sector-bottom"
                          on:click|stopPropagation={() => selectColor(card, index, 'blue')}
                          disabled={!isMyTurn || !$isConnected}
                          title="Blue"
                        ></button>
                        <button
                          class="color-sector sector-left"
                          on:click|stopPropagation={() => selectColor(card, index, 'green')}
                          disabled={!isMyTurn || !$isConnected}
                          title="Green"
                        ></button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
              <p class="card-count">{gameState?.player?.Cards?.length || 0} cards in hand</p>
            </div>
          </div>
        </section>
    {:else}
      <section class="box">
        <div class="nes-container is-rounded waiting-container">
          <p>Waiting for game to start...</p>
          <p>Players: {connectionDTO?.players?.map(p => p.name).join(', ') || 'Loading...'}</p>
          <progress class="nes-progress is-primary" value="30" max="100"></progress>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  /* Header styles */
  .game-header {
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
    border-bottom: 2px solid #e94560;
    padding: 0;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 24px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .status-dot.connected {
    background-color: #4ade80;
    box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74, 222, 128, 0.4);
    animation: glow 2s ease-in-out infinite;
  }

  .status-dot.disconnected {
    background-color: #ef4444;
    animation: pulse 1s infinite;
  }

  @keyframes glow {
    0%, 100% { box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 15px #4ade80, 0 0 30px rgba(74, 222, 128, 0.6); }
  }

  .status-label {
    font-size: 12px;
    color: #4ade80;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .status-dot.disconnected + .status-label {
    color: #ef4444;
  }

  .reconnect-btn {
    background: transparent;
    border: 1px solid #fbbf24;
    color: #fbbf24;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .reconnect-btn:hover {
    background: #fbbf24;
    color: #000;
  }

  .exit-btn {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    border: none;
    color: #fff;
    padding: 8px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .exit-btn:hover {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    transform: scale(1.02);
  }

  .header-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
  }

  .greeting {
    font-size: 28px;
    margin: 0;
    color: #fff;
    font-weight: 300;
  }

  .player-name {
    color: #fbbf24;
    font-weight: 600;
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .room-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: linear-gradient(135deg, rgba(233, 69, 96, 0.2) 0%, rgba(233, 69, 96, 0.1) 100%);
    padding: 12px 24px;
    border-radius: 12px;
    border: 2px solid #e94560;
    box-shadow: 0 0 20px rgba(233, 69, 96, 0.2);
  }

  .room-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .room-code {
    font-size: 28px;
    font-weight: bold;
    color: #e94560;
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 10px rgba(233, 69, 96, 0.5);
  }

  .players-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 16px;
  }

  .players-count {
    font-size: 32px;
    font-weight: bold;
    color: #4ade80;
    line-height: 1;
  }

  .players-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .container {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 160px);
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .bottom {
    flex: 1;
  }

  .box {
    margin-bottom: 20px;
  }

  .game-area {
    padding: 20px;
  }

  .game-board {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 16px;
    padding: 24px;
  }

  .card-count {
    text-align: center;
    color: #888;
    font-size: 14px;
    margin-top: 16px;
  }

  /* Toast notifications */
  .toast-container {
    position: fixed;
    top: 140px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 350px;
  }

  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    animation: slideIn 0.3s ease-out;
    font-size: 14px;
  }

  .toast-info {
    background-color: #212529;
    color: #fff;
    border-left: 4px solid #0d6efd;
  }

  .toast-error {
    background-color: #212529;
    color: #fff;
    border-left: 4px solid #dc3545;
  }

  .toast-success {
    background-color: #212529;
    color: #fff;
    border-left: 4px solid #198754;
  }

  .toast-message {
    flex: 1;
    margin-right: 10px;
  }

  .toast-close {
    background: none;
    border: none;
    color: #aaa;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .toast-close:hover {
    color: #fff;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .disconnected-notice {
    text-align: center;
    padding: 40px;
  }

  .waiting-container {
    text-align: center;
    padding: 40px;
  }

  .your-turn-badge {
    background-color: #4caf50;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    margin-left: 10px;
    animation: pulse 1s infinite;
  }

  .card {
    width: 100px;
    height: auto;
    margin: 5px;
    cursor: pointer;
    transition: transform 0.2s, opacity 0.2s;
  }

  .card:hover:not(.disabled) {
    transform: translateY(-10px);
  }

  .card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .top-card-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 20px;
  }

  .top-card-container .nes-btn {
    margin-left: 20px;
  }

  .top-card-container .nes-btn:disabled {
    opacity: 0.5;
  }

  .top-card {
    width: 150px;
    height: auto;
    position: relative;
    z-index: 1;
  }

  .top-card.blue {
    border: 15px solid rgba(0, 0, 255, 0.5);
    box-shadow: 0 0 20px 10px rgba(0, 0, 255, 0.3);
    background: rgba(0, 0, 255, 0.1);
  }

  .top-card.green {
    border: 15px solid rgba(0, 255, 0, 0.5);
    box-shadow: 0 0 20px 10px rgba(0, 255, 0, 0.3);
    background: rgba(0, 255, 0, 0.1);
  }

  .top-card.red {
    border: 15px solid rgba(255, 0, 0, 0.5);
    box-shadow: 0 0 20px 10px rgba(255, 0, 0, 0.3);
    background: rgba(255, 0, 0, 0.1);
  }

  .top-card.yellow {
    border: 15px solid rgba(255, 255, 0, 0.5);
    box-shadow: 0 0 20px 10px rgba(255, 255, 0, 0.3);
    background: rgba(255, 255, 0, 0.1);
  }

  .players-table {
    margin-right: 150px;
  }

  .arrow-container {
    display: flex;
    align-items: center;
    margin-right: 10px;
  }

  .arrow {
    font-size: 2rem;
  }

  .cards-container {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
  }

  .cards-section {
    max-width: 100%;
    overflow-x: auto;
  }

  .card-container {
    position: relative;
  }

  .color-picker {
    position: absolute;
    top: -15px;
    left: -15px;
    right: -15px;
    bottom: -15px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    z-index: 10;
  }

  .card-container:hover .color-picker {
    opacity: 1;
    pointer-events: auto;
  }

  .color-sector {
    position: absolute;
    width: 50px;
    height: 50px;
    border: 16px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: filter 0.15s ease, border-width 0.15s ease;
    box-sizing: border-box;
  }

  .color-sector:hover:not(:disabled) {
    filter: brightness(1.2);
    border-width: 20px;
  }

  .color-sector:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Top-left corner - Red */
  .sector-top {
    top: 0;
    left: 0;
    border-top-color: #e53935;
    border-left-color: #e53935;
    border-top-left-radius: 30px;
  }

  /* Top-right corner - Yellow */
  .sector-right {
    top: 0;
    right: 0;
    border-top-color: #fdd835;
    border-right-color: #fdd835;
    border-top-right-radius: 30px;
  }

  /* Bottom-right corner - Blue */
  .sector-bottom {
    bottom: 0;
    right: 0;
    border-bottom-color: #1e88e5;
    border-right-color: #1e88e5;
    border-bottom-right-radius: 30px;
  }

  /* Bottom-left corner - Green */
  .sector-left {
    bottom: 0;
    left: 0;
    border-bottom-color: #43a047;
    border-left-color: #43a047;
    border-bottom-left-radius: 30px;
  }

  .current-player {
    background-color: lightgreen;
  }

  .client-turn {
    background-color: lightgreen;
  }

  /* Card status styling */
  .card-status {
    font-size: 1.5rem;
    text-align: center;
  }

  .card-status.too_many {
    opacity: 0.5;
  }

  .card-status.many {
    opacity: 0.6;
  }

  .card-status.few {
    opacity: 0.75;
  }

  .card-status.very_few {
    opacity: 0.9;
  }

  .card-status.one {
    animation: fire-pulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes fire-pulse {
    from {
      transform: scale(1);
      filter: brightness(1);
    }
    to {
      transform: scale(1.2);
      filter: brightness(1.3);
    }
  }

  /* UNO spotlight effect */
  .uno-spotlight {
    background: linear-gradient(90deg, #ff6b6b, #feca57, #ff6b6b) !important;
    background-size: 200% 100%;
    animation: uno-gradient 1s ease infinite, uno-glow 0.5s ease-in-out infinite alternate;
    position: relative;
  }

  .uno-spotlight td {
    color: #000 !important;
    font-weight: bold;
  }

  .uno-name {
    text-shadow: 0 0 10px #fff, 0 0 20px #fff;
  }

  @keyframes uno-gradient {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  @keyframes uno-glow {
    from {
      box-shadow: 0 0 5px #ff6b6b, 0 0 10px #feca57;
    }
    to {
      box-shadow: 0 0 15px #ff6b6b, 0 0 25px #feca57, 0 0 35px #ff6b6b;
    }
  }

  /* Game Over Screen */
  .game-over-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    padding: 40px;
  }

  .game-over-content {
    text-align: center;
    padding: 60px 80px;
    border-radius: 20px;
    animation: fadeIn 0.5s ease-out;
  }

  .game-over-content.winner {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 165, 0, 0.1) 100%);
    border: 3px solid #ffd700;
    box-shadow: 0 0 40px rgba(255, 215, 0, 0.3), 0 0 80px rgba(255, 215, 0, 0.1);
  }

  .game-over-content.loser {
    background: linear-gradient(135deg, rgba(100, 100, 120, 0.2) 0%, rgba(60, 60, 80, 0.1) 100%);
    border: 3px solid #6c757d;
    box-shadow: 0 0 40px rgba(100, 100, 120, 0.2);
  }

  .trophy {
    font-size: 80px;
    margin-bottom: 20px;
    animation: bounce 1s ease-in-out infinite;
  }

  .game-over-content.winner .trophy {
    animation: winner-bounce 0.5s ease-in-out infinite alternate, trophy-glow 1s ease-in-out infinite;
  }

  @keyframes winner-bounce {
    from {
      transform: scale(1) rotate(-5deg);
    }
    to {
      transform: scale(1.1) rotate(5deg);
    }
  }

  @keyframes trophy-glow {
    0%, 100% {
      filter: drop-shadow(0 0 10px #ffd700);
    }
    50% {
      filter: drop-shadow(0 0 30px #ffd700) drop-shadow(0 0 50px #ff8c00);
    }
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .game-over-title {
    font-size: 48px;
    margin-bottom: 16px;
    font-weight: bold;
  }

  .winner-title {
    color: #ffd700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.3);
    animation: winner-text-glow 1s ease-in-out infinite alternate;
  }

  @keyframes winner-text-glow {
    from {
      text-shadow: 0 0 20px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.3);
    }
    to {
      text-shadow: 0 0 30px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.5), 0 0 80px rgba(255, 140, 0, 0.3);
    }
  }

  .loser-title {
    color: #adb5bd;
  }

  .game-over-message {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 40px;
  }

  .play-again-btn {
    font-size: 18px;
    padding: 16px 40px;
  }
</style>
