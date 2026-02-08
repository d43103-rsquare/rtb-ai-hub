import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { ROUTES } from '../utils/constants';
import { credentialsApi } from '../api/client';
import type { Credential } from '../types';

export function DashboardPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

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

  const stats = [
    {
      label: 'Connected Services',
      value: credentials.length,
      icon: '🔗',
      color: 'bg-blue-500',
      link: ROUTES.CREDENTIALS,
    },
    {
      label: 'Workflows Run',
      value: 0,
      icon: '⚡',
      color: 'bg-green-500',
      link: ROUTES.WORKFLOWS,
    },
    {
      label: 'Total Cost',
      value: '$0.00',
      icon: '💰',
      color: 'bg-purple-500',
      link: ROUTES.WORKFLOWS,
    },
    {
      label: 'Active APIs',
      value: credentials.filter((c) => c.isActive).length,
      icon: '🔑',
      color: 'bg-orange-500',
      link: ROUTES.CREDENTIALS,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to RTB AI Hub. Monitor your workflows and manage integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.link}>
            <Card className="hover:shadow-lg transition-shadow duration-200">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-lg ${stat.color} flex items-center justify-center text-2xl`}
                >
                  {stat.icon}
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-gray-600">{stat.label}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <div className="text-center py-8 text-gray-500">No recent activity</div>
          )}
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to={ROUTES.CREDENTIALS}
              className="block p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔑</span>
                <div>
                  <div className="font-semibold text-gray-900">Add API Keys</div>
                  <div className="text-sm text-gray-600">Configure Anthropic or OpenAI</div>
                </div>
              </div>
            </Link>
            <Link
              to={ROUTES.CREDENTIALS}
              className="block p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔗</span>
                <div>
                  <div className="font-semibold text-gray-900">Connect Services</div>
                  <div className="text-sm text-gray-600">Link Jira, GitHub, Figma, Datadog</div>
                </div>
              </div>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
