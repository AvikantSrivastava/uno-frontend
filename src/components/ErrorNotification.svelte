<script lang="ts">
  import { connectionError, websocketStore } from '../stores/websocketStore';
  import type { WebSocketError } from '../stores/websocketStore';

  export let error: WebSocketError | null = null;
  export let onDismiss: (() => void) | null = null;

  // Use the store error if no error prop is passed
  $: displayError = error || $connectionError;

  function handleDismiss() {
    if (onDismiss) {
      onDismiss();
    } else {
      websocketStore.clearError();
    }
  }

  function getErrorIcon(type: WebSocketError['type']): string {
    switch (type) {
      case 'connection':
        return 'nes-icon is-medium heart is-empty';
      case 'timeout':
        return 'nes-icon is-medium star is-empty';
      case 'server':
        return 'nes-icon is-medium close';
      case 'validation':
        return 'nes-icon is-medium close';
      default:
        return 'nes-icon is-medium close';
    }
  }
</script>

{#if displayError}
  <div class="error-notification nes-container is-rounded is-dark">
    <div class="error-content">
      <i class={getErrorIcon(displayError.type)}></i>
      <div class="error-text">
        <strong>{displayError.message}</strong>
        {#if displayError.details}
          <p class="error-details">{displayError.details}</p>
        {/if}
      </div>
    </div>
    <button class="nes-btn is-error dismiss-btn" on:click={handleDismiss}>
      Dismiss
    </button>
  </div>
{/if}

<style>
  .error-notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background-color: #ce372b;
    color: white;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-width: 300px;
    max-width: 600px;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      transform: translateX(-50%) translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }

  .error-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .error-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .error-text strong {
    font-size: 14px;
  }

  .error-details {
    font-size: 12px;
    margin: 0;
    opacity: 0.9;
  }

  .dismiss-btn {
    flex-shrink: 0;
    font-size: 12px;
    padding: 4px 8px;
  }
</style>
