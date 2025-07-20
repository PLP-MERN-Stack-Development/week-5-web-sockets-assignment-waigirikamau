
// At VERY TOP of server.js (before any other code)
require('dotenv').config({ path: process.env.DOTENV_PATH || '.env' });
// At the very top of server.js
dotenv.config({
  path: process.env.NODE_ENV === 'production' 
    ? '.env.production' 
    : '.env.development'
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5174',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  maxHttpBufferSize: 1e8 // 100MB for file uploads
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Store connected users and messages
const users = {};
const messages = [];
const typingUsers = {};

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (username, callback) => {
    if (!username || username.trim() === '') {
      return callback({ error: 'Username is required' });
    }

    // Check if username is already taken
    if (Object.values(users).some(u => u.username === username.trim())) {
      return callback({ error: 'Username already taken' });
    }

    users[socket.id] = { 
      username: username.trim(),
      id: socket.id,
      online: true,
      joinedAt: new Date().toISOString(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username.trim())}&background=random`
    };

    // Send initial data to new user
    callback({
      success: true,
      user: users[socket.id],
      messages: messages.slice(-100),
      users: Object.values(users)
    });

    // Broadcast updates to others
    socket.broadcast.emit('user_joined', users[socket.id]);
    io.emit('user_list', Object.values(users));
    
    console.log(`${users[socket.id].username} joined the chat`);
  });

  // Handle chat messages
  socket.on('send_message', (messageData, callback) => {
    if (!messageData.text || messageData.text.trim() === '') {
      return callback({ error: 'Message cannot be empty' });
    }

    const message = {
      id: Date.now(),
      text: messageData.text,
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
      read: false,
      isPrivate: false
    };

    messages.push(message);
    if (messages.length > 1000) messages.shift();

    io.emit('receive_message', message);
    callback({ success: true, messageId: message.id });
  });

  // Handle file messages
  socket.on('send_file', (fileData, callback) => {
    try {
      const fileName = `file_${Date.now()}_${fileData.name}`;
      const filePath = path.join(uploadsDir, fileName);
      
      // Save file buffer to disk
      const fileBuffer = Buffer.from(fileData.data.split(',')[1], 'base64');
      fs.writeFileSync(filePath, fileBuffer);

      const message = {
        id: Date.now(),
        file: {
          name: fileData.name,
          type: fileData.type,
          size: fileData.size,
          path: `/uploads/${fileName}`
        },
        sender: users[socket.id]?.username || 'Anonymous',
        senderId: socket.id,
        timestamp: new Date().toISOString(),
        read: false,
        isPrivate: false
      };

      messages.push(message);
      if (messages.length > 1000) messages.shift();

      io.emit('receive_message', message);
      callback({ success: true, messageId: message.id });
    } catch (error) {
      console.error('File upload error:', error);
      callback({ error: 'Failed to upload file' });
    }
  });

  // Handle private messages
  socket.on('private_message', ({ to, text }, callback) => {
    if (!users[to]) {
      return callback({ error: 'User not found' });
    }

    if (!text || text.trim() === '') {
      return callback({ error: 'Message cannot be empty' });
    }

    const message = {
      id: Date.now(),
      text: text.trim(),
      sender: users[socket.id]?.username,
      senderId: socket.id,
      recipientId: to,
      timestamp: new Date().toISOString(),
      read: false,
      isPrivate: true
    };

    messages.push(message);
    if (messages.length > 1000) messages.shift();

    socket.to(to).emit('private_message', message);
    socket.emit('private_message', message);
    callback({ success: true, messageId: message.id });
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    if (users[socket.id]) {
      typingUsers[socket.id] = isTyping ? users[socket.id] : null;
      socket.broadcast.emit('typing_users', 
        Object.values(typingUsers)
          .filter(Boolean)
          .map(u => ({ id: u.id, username: u.username }))
      );
    }
  });

  // Handle message read receipts
  socket.on('message_read', (messageId) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.senderId !== socket.id) {
      message.read = true;
      io.to(message.senderId).emit('message_read', messageId);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      users[socket.id].online = false;
      users[socket.id].lastSeen = new Date().toISOString();
      
      io.emit('user_left', users[socket.id]);
      console.log(`${users[socket.id].username} left the chat`);
      
      delete typingUsers[socket.id];
    }
  });
});

// File download endpoint
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// API routes
app.get('/api/messages', (req, res) => {
  res.json({
    count: messages.length,
    messages: messages.slice(-100)
  });
});

app.get('/api/users', (req, res) => {
  res.json({
    online: Object.values(users).filter(u => u.online),
    offline: Object.values(users).filter(u => !u.online)
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    users: Object.keys(users).length,
    messages: messages.length,
    uptime: process.uptime()
  });
});

// Serve client
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = { app, server, io };