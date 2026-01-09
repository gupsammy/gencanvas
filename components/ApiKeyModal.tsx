import React, { useState } from 'react';
import { Key, ExternalLink, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSubmit: (key: string) => void;
  onClose?: () => void;
  isChangingKey?: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSubmit, onClose, isChangingKey = false }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setError('Please enter your API key');
      return;
    }

    if (!trimmedKey.startsWith('AIza')) {
      setError('Invalid API key format. Gemini API keys start with "AIza"');
      return;
    }

    setError('');
    onSubmit(trimmedKey);
    setApiKey('');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '480px',
        width: '90%',
        border: '1px solid #333',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Key size={24} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'white' }}>
              {isChangingKey ? 'Change API Key' : 'Welcome to AI Canvas'}
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
              Powered by Google Gemini
            </p>
          </div>
        </div>

        <p style={{ color: '#aaa', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
          {isChangingKey
            ? 'Enter a new Gemini API key to replace the current one.'
            : 'To use this app, you need a Gemini API key. Your key is stored locally in your browser and never sent to any server except Google\'s API.'
          }
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '8px' }}>
              Gemini API Key
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError('');
                }}
                placeholder="AIza..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 12px',
                  backgroundColor: '#0a0a0a',
                  border: error ? '1px solid #ef4444' : '1px solid #333',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ef4444',
                fontSize: '13px',
                marginTop: '8px'
              }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#60a5fa',
              fontSize: '13px',
              textDecoration: 'none',
              marginBottom: '24px',
            }}
          >
            <ExternalLink size={14} />
            Get your free API key from Google AI Studio
          </a>

          <div style={{ display: 'flex', gap: '12px' }}>
            {isChangingKey && onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: 'transparent',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#888',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {isChangingKey ? 'Update Key' : 'Get Started'}
            </button>
          </div>
        </form>

        <p style={{
          color: '#666',
          fontSize: '12px',
          marginTop: '20px',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          Your API key is stored only in your browser's local storage.
          <br />It is never sent to our servers.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyModal;
