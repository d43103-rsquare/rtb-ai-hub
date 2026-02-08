import { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { credentialsApi, oauthApi } from '../api/client';
import { API_KEY_SERVICES, OAUTH_SERVICES } from '../utils/constants';
import type { Credential, ServiceType } from '../types';

export function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [selectedService, setSelectedService] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const data = await credentialsApi.getAll();
      setCredentials(data);
    } catch (error) {
      console.error('Failed to load credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddApiKey = async () => {
    if (!apiKey.trim()) return;

    setSubmitting(true);
    try {
      await credentialsApi.addApiKey({ service: selectedService, apiKey });
      setShowApiKeyModal(false);
      setApiKey('');
      await loadCredentials();
    } catch (error) {
      console.error('Failed to add API key:', error);
      alert('Failed to add API key. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCredential = async (service: ServiceType) => {
    if (!confirm(`Are you sure you want to remove ${service} credential?`)) return;

    try {
      await credentialsApi.deleteCredential(service);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to delete credential:', error);
      alert('Failed to delete credential. Please try again.');
    }
  };

  const handleConnectOAuth = async (service: string) => {
    try {
      const authUrl = await oauthApi.getConnectUrl(service);
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        authUrl,
        `Connect ${service}`,
        `width=${width},height=${height},left=${left},top=${top}`
      );

      const checkPopup = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          loadCredentials();
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to connect OAuth:', error);
      alert('Failed to connect. Please try again.');
    }
  };

  const isConnected = (service: string) => {
    return credentials.some((c) => c.service === service && c.isActive);
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 8) + '••••••••';
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Credentials</h1>
        <p className="mt-2 text-gray-600">Manage your API keys and OAuth connections</p>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">API Keys</h2>
          <Button onClick={() => setShowApiKeyModal(true)}>Add API Key</Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            {API_KEY_SERVICES.map((service) => {
              const credential = credentials.find((c) => c.service === service.name);
              return (
                <div
                  key={service.name}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{service.displayName}</div>
                    {credential ? (
                      <div className="text-sm text-gray-600 font-mono">
                        {maskApiKey(service.placeholder)}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Not configured</div>
                    )}
                  </div>
                  {credential ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteCredential(credential.service)}
                    >
                      Remove
                    </Button>
                  ) : (
                    <div className="text-sm text-gray-400">—</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-gray-900 mb-6">OAuth Connections</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {OAUTH_SERVICES.map((service) => {
            const connected = isConnected(service.name);
            return (
              <div key={service.name} className="p-6 rounded-lg border border-gray-200 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{service.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900">{service.displayName}</div>
                    <div className={`text-sm ${connected ? 'text-green-600' : 'text-gray-500'}`}>
                      {connected ? 'Connected' : 'Not connected'}
                    </div>
                  </div>
                </div>
                {connected ? (
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => handleDeleteCredential(service.name as ServiceType)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() => handleConnectOAuth(service.name)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Modal isOpen={showApiKeyModal} onClose={() => setShowApiKeyModal(false)} title="Add API Key">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Service</label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value as 'anthropic' | 'openai')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {API_KEY_SERVICES.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.displayName}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="API Key"
            type="password"
            placeholder={API_KEY_SERVICES.find((s) => s.name === selectedService)?.placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleAddApiKey}
              isLoading={submitting}
              disabled={!apiKey.trim()}
              className="flex-1"
            >
              Add Key
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowApiKeyModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
