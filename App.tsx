import React, { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState, Player, ChatMessage, DrawData } from './types';
import Canvas, { CanvasRef } from './components/Canvas';
import LoadingSpinner from './components/LoadingSpinner';
import { PencilIcon, EraseIcon, SendIcon, NextIcon } from './components/icons';

// --- Helper Components ---

const PlayerList = ({ players, drawerId }: { players: Player[], drawerId: string | null }) => (
  <div className="w-full md:w-56 bg-white/30 backdrop-blur-md p-4 rounded-xl shadow-lg">
    <h3 className="font-bold text-xl text-white mb-3 text-center">Oyunçular</h3>
    <ul className="space-y-2">
      {players.map((player) => (
        <li key={player.id} className="flex justify-between items-center bg-white/20 p-2 rounded-lg">
          <div className="flex items-center">
            {player.id === drawerId && <PencilIcon className="w-5 h-5 mr-2 text-yellow-300" />}
            <span className="font-semibold text-white truncate">{player.username}</span>
          </div>
          <span className="font-bold text-lg text-white">{player.score}</span>
        </li>
      ))}
    </ul>
  </div>
);

const ChatArea = ({ messages, onSendMessage }: { messages: ChatMessage[], onSendMessage: (msg: string) => void }) => {
  const [input, setInput] = useState('');
  const chatBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="w-full md:w-72 bg-white/30 backdrop-blur-md p-4 rounded-xl shadow-lg flex flex-col">
      <h3 className="font-bold text-xl text-white mb-3 text-center">Söhbət & Təxmin</h3>
      <div ref={chatBoxRef} className="flex-grow h-64 overflow-y-auto bg-black/10 rounded-lg p-2 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.isSystemMessage || msg.isCorrectGuess ? 'items-center' : 'items-start'}`}>
            <div className={`px-3 py-1 rounded-lg max-w-xs break-words ${
                msg.isSystemMessage ? 'bg-gray-500/70 text-gray-200 italic' : 
                msg.isCorrectGuess ? 'bg-green-500/80 text-white font-bold' :
                'bg-indigo-500/80 text-white'
              }`}>
              {!msg.isSystemMessage && !msg.isCorrectGuess && <p className="font-bold text-sm text-indigo-200">{msg.username}</p>}
              <p>{msg.message}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Təxminini yaz..."
          className="flex-grow bg-white/20 border-2 border-transparent focus:border-purple-300 text-white placeholder-white/60 rounded-l-lg px-3 py-2 outline-none transition"
        />
        <button onClick={handleSend} className="bg-purple-500 hover:bg-purple-600 text-white p-3 rounded-r-lg transition">
          <SendIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};


const DrawingTools = ({ onClear, onColorChange, onWidthChange, color, width }: { onClear: () => void, onColorChange: (c: string) => void, onWidthChange: (w: number) => void, color: string, width: number}) => {
    const colors = ['#111827', '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];
    const widths = [2, 4, 8, 14];
    return (
        <div className="bg-white/30 backdrop-blur-md p-2 rounded-xl shadow-lg flex items-center justify-center space-x-4">
             <button onClick={onClear} className="flex items-center space-x-2 bg-yellow-400/80 hover:bg-yellow-500/80 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                <EraseIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center space-x-2">
                {colors.map(c => (
                    <button key={c} onClick={() => onColorChange(c)} className={`w-8 h-8 rounded-full transition-transform transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''}`} style={{ backgroundColor: c }}/>
                ))}
            </div>
             <div className="flex items-center space-x-2">
                {widths.map(w => (
                    <button key={w} onClick={() => onWidthChange(w)} className={`flex justify-center items-center w-8 h-8 rounded-full bg-white/50 transition-transform transform hover:scale-110 ${width === w ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''}`}>
                       <div className="bg-gray-800 rounded-full" style={{width: w+4, height: w+4}}></div>
                    </button>
                ))}
            </div>
        </div>
    )
}

// --- Main App Component ---

const SERVER_URL = 'https://draw-guess-backend.glitch.me/'; // Replace with your actual server URL

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.Lobby);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentWord, setCurrentWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentDrawerId, setCurrentDrawerId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [roundResult, setRoundResult] = useState<{ winner?: Player; word: string } | null>(null);
  
  const [drawColor, setDrawColor] = useState('#111827');
  const [lineWidth, setLineWidth] = useState(4);

  const canvasRef = useRef<CanvasRef>(null);

  const isDrawer = socket?.id === currentDrawerId;

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('Connected to server! ID:', newSocket.id));
    
    newSocket.on('gameState', (state) => setGameState(state));
    newSocket.on('updatePlayers', (players) => setPlayers(players));
    newSocket.on('chatMessage', (msg) => setMessages(prev => [...prev, msg]));
    
    newSocket.on('newRound', ({ drawerId, word, time }) => {
      setGameState(GameState.Game);
      setCurrentDrawerId(drawerId);
      setCurrentWord(word);
      setTimeLeft(time);
      setMessages([{ username: 'System', message: `${players.find(p=>p.id === drawerId)?.username} rəsm çəkir...`, isSystemMessage: true }]);
      canvasRef.current?.clear();
    });

    newSocket.on('timer', (time) => setTimeLeft(time));
    newSocket.on('drawing', (data: DrawData) => canvasRef.current?.drawFromServer(data));
    newSocket.on('clearCanvas', () => canvasRef.current?.clear());

    newSocket.on('roundEnd', (result: { winner?: Player, word: string }) => {
      setGameState(GameState.RoundEnd);
      setRoundResult(result);
    });

    return () => { newSocket.close(); };
  }, []);

  const handleJoinGame = () => {
    if (username.trim() && socket) {
      socket.emit('joinGame', username.trim());
      setGameState(GameState.Waiting);
    }
  };
  
  const handleDraw = useCallback((data: DrawData) => {
    if (socket && isDrawer) {
      socket.emit('drawing', data);
    }
  }, [socket, isDrawer]);

  const handleSendMessage = (message: string) => {
    socket?.emit('chatMessage', message);
  };

  const handleClearCanvas = () => {
      if(isDrawer) {
          canvasRef.current?.clear();
          socket?.emit('clearCanvas');
      }
  }

  const handleReadyForNext = () => {
    socket?.emit('readyForNextRound');
    setRoundResult(null);
    setGameState(GameState.Waiting);
  }

  const renderContent = () => {
    switch (gameState) {
      case GameState.Lobby:
        return (
          <div className="text-center bg-white/30 backdrop-blur-md p-10 rounded-2xl shadow-2xl flex flex-col items-center">
            <h1 className="text-5xl font-bold text-white mb-4">Çək və Tap Online</h1>
            <p className="text-xl text-white/80 mb-8">Dostlarınla qoşul və əylən!</p>
            <div className="flex w-full max-w-sm">
              <input
                type="text"
                placeholder="İstifadəçi adın..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                className="flex-grow bg-white/20 border-2 border-transparent focus:border-purple-300 text-white placeholder-white/60 rounded-l-lg px-4 py-3 outline-none transition text-lg"
              />
              <button
                onClick={handleJoinGame}
                className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-r-lg text-lg shadow-lg transform hover:scale-105 transition-all duration-300"
              >
                Qoşul
              </button>
            </div>
          </div>
        );
      case GameState.Waiting:
        return <LoadingSpinner text="Oyunçular gözlənilir..." />;
      case GameState.RoundEnd:
        return (
            <div className="text-center flex flex-col items-center bg-white/30 backdrop-blur-md p-10 rounded-2xl shadow-2xl">
                {roundResult?.winner ? (
                     <h2 className="text-4xl font-bold text-green-300 mb-4">✨ {roundResult.winner.username} Tapdı! ✨</h2>
                ) : (
                    <h2 className="text-4xl font-bold text-red-300 mb-4">Təəssüf, vaxt bitdi!</h2>
                )}
                <p className="text-2xl text-white/90">Düzgün söz: <span className="font-bold text-yellow-300 tracking-wider">{roundResult?.word}</span></p>
                <p className="text-2xl text-white/90 mt-6">Ümumi Skor: <span className="font-bold text-white">{players.find(p => p.id === socket?.id)?.score}</span></p>
                <button onClick={handleReadyForNext} className="mt-8 flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-transform transform hover:scale-105">
                    <NextIcon className="w-6 h-6" />
                    <span>Növbəti Raund</span>
                </button>
            </div>
        );
      case GameState.Game:
        return (
          <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row gap-4">
            <PlayerList players={players} drawerId={currentDrawerId} />
            <div className="flex-grow flex flex-col items-center gap-4">
              <div className="w-full bg-white/30 backdrop-blur-md p-3 rounded-xl shadow-lg flex justify-between items-center font-bold text-white">
                <span className="text-2xl">Vaxt: <span className="text-yellow-300">{timeLeft}</span></span>
                <p className="text-4xl tracking-widest">{currentWord}</p>
                <span className="text-2xl">Skor: <span className="text-yellow-300">{players.find(p => p.id === socket?.id)?.score || 0}</span></span>
              </div>
              <Canvas ref={canvasRef} width={800} height={500} onDraw={handleDraw} isDrawingEnabled={isDrawer} color={drawColor} lineWidth={lineWidth}/>
              {isDrawer && <DrawingTools onClear={handleClearCanvas} onColorChange={setDrawColor} onWidthChange={setLineWidth} color={drawColor} width={lineWidth}/>}
            </div>
            <ChatArea messages={messages} onSendMessage={handleSendMessage} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-800 via-purple-800 to-pink-800">
      <header className="absolute top-0 left-0 p-4 flex items-center text-white/70">
        <PencilIcon className="w-8 h-8 mr-2" />
        <span className="text-xl font-semibold">Çək və Tap Online</span>
      </header>
      {renderContent()}
    </main>
  );
}
