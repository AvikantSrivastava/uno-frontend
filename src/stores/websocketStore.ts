// websocketStore.ts

import { writable, derived, get } from 'svelte/store';

// Connection states
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// Error types for better error handling
export interface WebSocketError {
  type: 'connection' | 'message' | 'timeout' | 'server' | 'validation';
  message: string;
  timestamp: Date;
  details?: string;
}

// Store state interface
interface WebSocketState {
  socket: WebSocket | null;
  status: ConnectionStatus;
  error: WebSocketError | null;
  reconnectAttempts: number;
  lastConnectedUrl: string | null;
}

// Configuration
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const CONNECTION_TIMEOUT_MS = 10000;

// Create the main store
const createWebSocketStore = () => {
  const initialState: WebSocketState = {
    socket: null,
    status: 'disconnected',
    error: null,
    reconnectAttempts: 0,
    lastConnectedUrl: null,
  };

  const { subscribe, set, update } = writable<WebSocketState>(initialState);

  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearTimeouts = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  const setError = (type: WebSocketError['type'], message: string, details?: string) => {
    const error: WebSocketError = {
      type,
      message,
      timestamp: new Date(),
      details,
    };
    update(state => ({ ...state, error, status: 'error' }));
    return error;
  };

  const clearError = () => {
    update(state => ({ ...state, error: null }));
  };

  const connect = (url: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      clearTimeouts();
      clearError();

      update(state => ({
        ...state,
        status: 'connecting',
        lastConnectedUrl: url,
      }));

      // Connection timeout
      connectionTimeout = setTimeout(() => {
        const currentState = get({ subscribe });
        if (currentState.status === 'connecting') {
          currentState.socket?.close();
          const error = setError('timeout', 'Connection timed out', 'Server did not respond within 10 seconds');
          reject(error);
        }
      }, CONNECTION_TIMEOUT_MS);

      try {
        const socket = new WebSocket(url);

        socket.onopen = () => {
          clearTimeouts();
          update(state => ({
            ...state,
            socket,
            status: 'connected',
            error: null,
            reconnectAttempts: 0,
          }));
          resolve(socket);
        };

        socket.onclose = (event) => {
          clearTimeouts();
          const wasConnected = get({ subscribe }).status === 'connected';

          update(state => ({
            ...state,
            socket: null,
            status: 'disconnected',
          }));

          // If it was a normal close, don't set error
          if (event.code === 1000) {
            return;
          }

          // Set appropriate error message based on close code
          let errorMessage = 'Connection closed';
          let errorDetails = `Code: ${event.code}`;

          switch (event.code) {
            case 1001:
              errorMessage = 'Server is going away';
              break;
            case 1002:
              errorMessage = 'Protocol error';
              break;
            case 1003:
              errorMessage = 'Unsupported data type';
              break;
            case 1006:
              errorMessage = 'Connection lost unexpectedly';
              errorDetails = 'The connection was closed abnormally';
              break;
            case 1007:
              errorMessage = 'Invalid data received';
              break;
            case 1008:
              errorMessage = 'Policy violation';
              break;
            case 1009:
              errorMessage = 'Message too large';
              break;
            case 1011:
              errorMessage = 'Server error';
              break;
            case 4000:
              errorMessage = 'Room not found';
              break;
            case 4001:
              errorMessage = 'Room is full';
              break;
            case 4002:
              errorMessage = 'Invalid player name';
              break;
            case 4003:
              errorMessage = 'Game already started';
              break;
          }

          if (event.reason) {
            errorDetails = event.reason;
          }

          setError('connection', errorMessage, errorDetails);

          // Attempt reconnection if was previously connected
          if (wasConnected) {
            attemptReconnect();
          }
        };

        socket.onerror = (event) => {
          console.error('WebSocket error:', event);
          // The error event doesn't contain much info, onclose will handle the details
        };

        // Store the socket immediately for potential cleanup
        update(state => ({ ...state, socket }));

      } catch (err) {
        clearTimeouts();
        const error = setError('connection', 'Failed to create WebSocket connection', String(err));
        reject(error);
      }
    });
  };

  const attemptReconnect = () => {
    const currentState = get({ subscribe });

    if (currentState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setError('connection', 'Failed to reconnect', `Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
      return;
    }

    if (!currentState.lastConnectedUrl) {
      return;
    }

    update(state => ({
      ...state,
      status: 'reconnecting',
      reconnectAttempts: state.reconnectAttempts + 1,
    }));

    reconnectTimeout = setTimeout(() => {
      const state = get({ subscribe });
      if (state.lastConnectedUrl) {
        connect(state.lastConnectedUrl).catch(() => {
          // Error already handled in connect
        });
      }
    }, RECONNECT_DELAY_MS);
  };

  const disconnect = () => {
    clearTimeouts();
    const currentState = get({ subscribe });

    if (currentState.socket) {
      currentState.socket.close(1000, 'Client disconnected');
    }

    set(initialState);
  };

  const sendMessage = (message: object): boolean => {
    const currentState = get({ subscribe });

    if (!currentState.socket || currentState.status !== 'connected') {
      setError('message', 'Cannot send message', 'WebSocket is not connected');
      return false;
    }

    try {
      currentState.socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      setError('message', 'Failed to send message', String(err));
      return false;
    }
  };

  return {
    subscribe,
    connect,
    disconnect,
    sendMessage,
    clearError,
    attemptReconnect,
  };
};

export const websocketStore = createWebSocketStore();

// Derived stores for convenience
export const websocket = derived(websocketStore, $store => $store.socket);
export const connectionStatus = derived(websocketStore, $store => $store.status);
export const connectionError = derived(websocketStore, $store => $store.error);
export const isConnected = derived(websocketStore, $store => $store.status === 'connected');
export const isConnecting = derived(websocketStore, $store => $store.status === 'connecting' || $store.status === 'reconnecting');

// Legacy function for backward compatibility
export function connectWebSocket(url: string): void {
  websocketStore.connect(url).catch(err => {
    console.error('WebSocket connection failed:', err);
  });
}
