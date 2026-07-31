<script lang="ts">
  import { Router, Route } from 'svelte-routing';
  import CreateRoom from './components/CreateRoom.svelte';
  import JoinRoom from './components/JoinRoom.svelte';
  import Game from './components/Game.svelte'; // Ensure you have this component
  import StartPage from './components/StartPage.svelte';
</script>

<Router>
  <Route path="/create-room" component={CreateRoom} />
  <Route path="/join-room" component={JoinRoom} />
  <Route path="/game" component={Game} />
  <Route path="/" component={StartPage} />
</Router>
