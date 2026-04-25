const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = {}; // { code: { players: [id, id], board: [], turn: 0, symbols: {} } }

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function checkWinner(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(Boolean)) return 'draw';
  return null;
}

io.on('connection', (socket) => {
  socket.on('create_room', () => {
    const code = generateCode();
    rooms[code] = { players: [socket.id], board: Array(9).fill(null), turn: 0, symbols: { [socket.id]: 'X' } };
    socket.join(code);
    socket.emit('room_created', { code, symbol: 'X' });
  });

  socket.on('join_room', (code) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('error', 'Room is full');
    room.players.push(socket.id);
    room.symbols[socket.id] = 'O';
    socket.join(code);
    socket.emit('room_joined', { code, symbol: 'O' });
    io.to(code).emit('game_start', { board: room.board, turn: room.players[room.turn] });
  });

  socket.on('make_move', ({ code, index }) => {
    const room = rooms[code];
    if (!room) return;
    if (room.players[room.turn] !== socket.id) return;
    if (room.board[index]) return;

    room.board[index] = room.symbols[socket.id];
    const winner = checkWinner(room.board);

    if (winner) {
      io.to(code).emit('game_over', { board: room.board, winner: winner === 'draw' ? 'draw' : socket.id, symbol: winner });
      delete rooms[code];
    } else {
      room.turn = 1 - room.turn;
      io.to(code).emit('board_update', { board: room.board, turn: room.players[room.turn] });
    }
  });

  socket.on('rematch', (code) => {
    if (!rooms[code]) {
      rooms[code] = { players: [], board: Array(9).fill(null), turn: 0, symbols: {} };
    }
    const room = rooms[code];
    if (!room.players.includes(socket.id)) room.players.push(socket.id);
    room.symbols[socket.id] = room.players.indexOf(socket.id) === 0 ? 'X' : 'O';
    if (room.players.length === 2) {
      room.board = Array(9).fill(null);
      room.turn = 0;
      io.to(code).emit('game_start', { board: room.board, turn: room.players[0] });
    }
  });

  socket.on('disconnecting', () => {
    for (const code of socket.rooms) {
      if (rooms[code]) {
        io.to(code).emit('opponent_left');
        delete rooms[code];
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
