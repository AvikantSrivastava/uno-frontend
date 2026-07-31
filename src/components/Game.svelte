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
  import type { Card, Player, Game, Room, GameState, ConnectionDTO, InfoDTO } from "../models";

  // Game state
  let gameState: { player: Player; room: Room; game: Game } | null = null;
  let connectionDTO: ConnectionDTO['obj'] | null = null;
  let infoDTO: InfoDTO['obj'] | null = null;
  let connectedPlayers: number = 0;

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

<div class="container">
  <div class="top">
    <div class="left">
      <section class="box">
        <div class="nes-container with-title">
          <p class="title">Connection Info</p>
          <!-- {#if gameState} -->
          <table class="nes-table is-bordered is-centered">
            <tbody>
              <tr>
                <td><strong>Player Name:</strong></td>
                <td>{connectionDTO?.player_name}</td>
              </tr>
              <tr>
                <td><strong>Room ID:</strong></td>
                <td>{connectionDTO?.room_id}</td>
              </tr>
              <tr>
                <td><strong>Max Players:</strong></td>
                <td>{connectionDTO ? connectionDTO.max_players : ""}</td>
              </tr>
            </tbody>
          </table>
          <!-- {/if} -->
        </div>
      </section>
    </div>

    <div class="right">
      <section class="box">
        <div class="nes-container with-title">
          <p class="title">Messages</p>
          <!-- {#if infoDTO && infoDTO.message} -->
          <div class="nes-balloon from-left">
            <p>{infoDTO ? infoDTO.Message : ""}</p>
          </div>
          <!-- {/if} -->
        </div>
      </section>
    </div>
  </div>

  <div class="bottom">
    {#if gameState}
      <section class="box">
        <div class="nes-container with-title">
          <p class="title">Game State</p>
          <div class="flex-column flex-wrap">
            <div class="top-card-container">
              <div class="arrow-container">
                <img
                  src="assets/arrow.svg"
                  alt="arrow"
                  class="arrow"
                  style="transform: rotate({gameState?.game?.reverse
                    ? 180
                    : 0}deg);"
                />
              </div>
              <table class="nes-table is-bordered is-centered players-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Turn</th>
                  </tr>
                </thead>
                <tbody>
                  {#each gameState?.room?.players as player}
                    <tr class="{gameState?.game?.turn === player && gameState?.player?.Name === player ? 'client-turn' : ''}">
                      <td>{player}</td>
                      <td>
                        {#if gameState?.game?.turn === player}
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
                disabled={gameState?.game?.turn !== gameState?.player?.Name}
                >Draw</button
              >
            </div>
            <div class="cards-section">
              <div style="margin-bottom: 40px;"></div>
              <h3 style="text-align: center;">Your Cards</h3>
              <div class="cards-container">
                {#each gameState?.player?.Cards as card, index}
                  <div class="card-container">
                    <img
                      src={getCardImage(card)}
                      alt="{card.Rank} {card.Color}"
                      class="card"
                      on:click={() => playCard(card, index)}
                    />
                    {#if card.Rank === "wild" || card.Rank === "draw_4"}
                      <div class="color-picker">
                        <button class="nes-btn is-primary" on:click={() => selectColor(card, index, 'blue')}>Blue</button>
                        <button class="nes-btn is-success" on:click={() => selectColor(card, index, 'green')}>Green</button>
                        <button class="nes-btn is-warning" on:click={() => selectColor(card, index, 'yellow')}>Yellow</button>
                        <button class="nes-btn is-error" on:click={() => selectColor(card, index, 'red')}>Red</button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
              <h5 style="text-align: center;">
                Count: {gameState?.player?.Counter}
              </h5>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .title-container {
    text-align: center;
    margin: 20px 0;
  }

  .container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
  }

  .top {
    display: flex;
    flex: 1;
  }

  .bottom {
    flex: 3;
  }

  .left,
  .right {
    flex: 1;
    margin-right: 20px;
  }

  .right {
    margin-right: 0;
  }

  .box {
    margin-bottom: 20px;
  }

  .card {
    width: 100px;
    height: auto;
    margin: 5px;
    cursor: pointer;
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
  }

  .card-container {
    position: relative;
  }

  .color-picker {
    display: none;
    position: absolute;
    margin-top: 2px;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
  }

  .card-container:hover .color-picker {
    display: block;
    opacity: 1;
  }

  .current-player {
    background-color: lightgreen;
  }

  .client-turn {
    background-color: lightgreen;
  }
</style>
