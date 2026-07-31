export type Card = {
  Color: string;
  Rank: string;
};

export type Player = {
  Name: string;
  Cards: Card[];
  Counter: number;
  Drawn?: boolean;
};

export type Game = {
  topcard: Card;
  topcolor: string;
  turn: string;
  reverse: boolean;
};

// Card status representing how many cards a player has
export type CardStatus = 'too_many' | 'many' | 'few' | 'very_few' | 'one';

// Player info visible to other players
export type PlayerInfo = {
  name: string;
  card_status: CardStatus;
  is_uno: boolean;
};

export type Room = {
  id: number;
  max_players: number;
  players: PlayerInfo[];
};

export type GameState = {
  obj: {
    player: Player;
    room: Room;
    game: Game;
  };
};

export type ConnectionDTO = {
  obj: {
    player_name: string;
    room_id: number;
    max_players: number;
    players: PlayerInfo[];
  };
};

export type InfoDTO = {
  obj: {
    Message: string;
  };
};

export type ErrorDTO = {
  obj: {
    message: string;
    code?: string;
  };
};

export type WinnerDTO = {
  obj: {
    winner_name: string;
    is_winner: boolean;
  };
};
