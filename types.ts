export enum GameState {
  Lobby,
  Waiting,
  Game,
  RoundEnd,
}

export interface Player {
  id: string;
  username: string;
  score: number;
}

export interface ChatMessage {
  username: string;
  message: string;
  isSystemMessage?: boolean;
  isCorrectGuess?: boolean;
}

export interface DrawData {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  lineWidth: number;
}
