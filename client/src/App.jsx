import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './socket/socket';
import './App.css';

function App() {
  // Existing state and ref declarations remain the same
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('global');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [file, setFile] = useState(null);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const {
    isConnected,
    connect,
    sendMessage,
    sendPrivateMessage,
    sendFile,
    setTyping,
    messages,
    users,
    typingUsers,
    socket
  } = useSocket();

  // All your existing useCallback and useEffect hooks remain the same
  // ... (keep all your existing logic functions)

  return (
    <div className={`app-container ${!isConnected ? 'join-screen-bg' : ''}`}>
      {!isConnected ? (
        <div className="join-screen">
          <div className="join-card">
            <h1 className="text-3xl font-bold text-white mb-8">Welcome to ChatApp</h1>
            <div className="input-group">
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
                ref={inputRef}
                className="join-input"
              />
              <button 
                onClick={handleJoin}
                className="join-button"
                disabled={!username.trim()}
              >
                Join Chat
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="chat-app">
          <div className="sidebar">
            <div className="sidebar-header">
              <h2 className="text-xl font-semibold">Chat Rooms</h2>
            </div>
            
            <div 
              className={`chat-tab ${activeTab === 'global' ? 'active' : ''}`}
              onClick={() => setActiveTab('global')}
            >
              <span className="tab-icon">🌐</span>
              <span className="tab-label">Global Chat</span>
            </div>
            
            <div className="user-list-section">
              <h3 className="user-list-header">
                Online Users ({users.filter(u => u.online && u.id !== socket.id).length})
              </h3>
              <div className="user-list">
                {users.filter(u => u.online && u.id !== socket.id).map(user => (
                  <div 
                    key={user.id}
                    className={`chat-tab ${activeTab === user.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab(user.id);
                      handleMessagesRead();
                    }}
                  >
                    <div className="user-info">
                      <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
                      <span className="username">{user.username}</span>
                    </div>
                    <div className="user-status">
                      {unreadCounts[user.id] > 0 && (
                        <span className="unread-badge">{unreadCounts[user.id]}</span>
                      )}
                      {typingUsers.includes(user.id) && (
                        <span className="typing-indicator">...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chat-main">
            <div className="chat-header">
              <h2 className="chat-title">
                {activeTab === 'global' 
                  ? 'Global Chat' 
                  : `Chat with ${users.find(u => u.id === activeTab)?.username}`}
              </h2>
              {typingUsers.length > 0 && (
                <div className="typing-notice">
                  {typingUsers.map(id => users.find(u => u.id === id)?.username).join(', ')} 
                  {typingUsers.length > 1 ? ' are' : ' is'} typing...
                </div>
              )}
            </div>

            <div className="messages-container" onClick={handleMessagesRead}>
              {filteredMessages().map((msg) => (
                <div 
                  key={msg.id} 
                  className={`message ${msg.senderId === socket.id ? 'outgoing' : 'incoming'}`}
                >
                  {msg.senderId !== socket.id && (
                    <div className="message-sender">
                      <span className="sender-avatar">{msg.sender.charAt(0).toUpperCase()}</span>
                      {msg.sender}
                    </div>
                  )}
                  <div className="message-bubble">
                    {msg.file ? (
                      <div className="file-message">
                        <a href={msg.file.data} download={msg.file.name} className="file-link">
                          📎 {msg.file.name}
                        </a>
                        {msg.file.type.startsWith('image/') && (
                          <img src={msg.file.data} alt={msg.file.name} className="file-image" />
                        )}
                      </div>
                    ) : (
                      <p>{msg.message}</p>
                    )}
                    <div className="message-meta">
                      <span className="timestamp">{formatTime(msg.timestamp)}</span>
                      {msg.senderId === socket.id && (
                        <span className={`message-status ${msg.read ? 'read' : ''}`}>
                          {msg.read ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-area">
              <button 
                className="file-attach-button"
                onClick={() => fileInputRef.current.click()}
                title="Attach file"
              >
                <svg className="file-icon" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                  <path d="M14 2v6h6M12 18v-6M9 15h6"/>
                </svg>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <input
                type="text"
                placeholder={`Message ${activeTab === 'global' ? 'everyone' : users.find(u => u.id === activeTab)?.username}`}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setTyping(e.target.value.length > 0);
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                ref={inputRef}
                className="message-input"
              />
              <button 
                onClick={handleSendMessage}
                disabled={!message.trim()}
                className="send-button"
              >
                <svg className="send-icon" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;