// socket.js - Enhanced Socket.io client setup
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  withCredentials: true
});

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [availableRooms, setAvailableRooms] = useState(['general', 'random']);
  const [roomMembers, setRoomMembers] = useState([]);

  // Connection management
  const connect = (username) => {
    socket.connect();
    socket.emit('user_join', username, (response) => {
      if (response.success) {
        setAvailableRooms(response.rooms || ['general', 'random']);
      }
    });
  };

  const disconnect = () => {
    socket.disconnect();
  };

  // Room management
  const joinRoom = (room, username) => {
    socket.emit('join_room', { room, username }, (response) => {
      if (response.success) {
        setRoomMembers(response.members);
        setMessages(response.messages);
      }
    });
  };

  const leaveRoom = (room, username) => {
    socket.emit('leave_room', { room, username });
  };

  // Message handling
  const sendMessage = (message) => {
    socket.emit('send_message', { text: message }, (response) => {
      if (!response.success) {
        console.error('Message failed:', response.error);
      }
    });
  };

  const sendPrivateMessage = (to, message) => {
    socket.emit('private_message', { to, text: message }, (response) => {
      if (!response.success) {
        console.error('Private message failed:', response.error);
      }
    });
  };

  // File handling
  const sendFile = (fileData, room) => {
    socket.emit('send_file', { 
      ...fileData,
      room
    }, (response) => {
      if (!response.success) {
        console.error('File upload failed:', response.error);
      }
    });
  };

  // Typing indicators
  const setTyping = ({ isTyping, room }) => {
    socket.emit('typing', { isTyping, room });
  };

  // Event listeners
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onMessage = (message) => {
      setMessages(prev => [...prev, message]);
    };

    const onUserUpdate = (userList) => {
      setUsers(userList);
    };

    const onRoomUpdate = (data) => {
      if (data.type === 'join' || data.type === 'leave') {
        setRoomMembers(data.members);
      }
    };

    const onTypingUpdate = (users) => {
      setTypingUsers(users);
    };

    const onNewRoom = (room) => {
      setAvailableRooms(prev => [...prev, room]);
    };

    // Register all listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onMessage);
    socket.on('private_message', onMessage);
    socket.on('user_list', onUserUpdate);
    socket.on('user_joined', onUserUpdate);
    socket.on('user_left', onUserUpdate);
    socket.on('room_update', onRoomUpdate);
    socket.on('typing_users', onTypingUpdate);
    socket.on('new_room', onNewRoom);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onMessage);
      socket.off('private_message', onMessage);
      socket.off('user_list', onUserUpdate);
      socket.off('user_joined', onUserUpdate);
      socket.off('user_left', onUserUpdate);
      socket.off('room_update', onRoomUpdate);
      socket.off('typing_users', onTypingUpdate);
      socket.off('new_room', onNewRoom);
    };
  }, []);

  return {
    socket,
    isConnected,
    messages,
    users,
    typingUsers,
    availableRooms,
    roomMembers,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendPrivateMessage,
    sendFile,
    setTyping
  };
};

export default socket;