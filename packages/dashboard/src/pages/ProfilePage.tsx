import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { format } from 'date-fns';

export function ProfilePage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        <p className="mt-2 text-gray-600">Manage your account settings</p>
      </div>

      <Card>
        <div className="flex items-start gap-6">
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-24 h-24 rounded-full" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
              <p className="text-gray-600">{user.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Workspace</span>
                <div className="font-medium text-gray-900">{user.workspaceDomain}</div>
              </div>
              <div>
                <span className="text-gray-500">User ID</span>
                <div className="font-mono text-gray-900">{user.id}</div>
              </div>
              <div>
                <span className="text-gray-500">Member Since</span>
                <div className="font-medium text-gray-900">
                  {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Last Login</span>
                <div className="font-medium text-gray-900">
                  {format(new Date(user.lastLogin), 'MMM dd, yyyy HH:mm')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Account Actions</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
            <div>
              <div className="font-semibold text-gray-900">Sign Out</div>
              <div className="text-sm text-gray-600">Sign out from your account</div>
            </div>
            <Button variant="danger" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold text-gray-900 mb-4">System Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Platform Version</span>
            <div className="font-medium text-gray-900">v1.0.0</div>
          </div>
          <div>
            <span className="text-gray-500">Environment</span>
            <div className="font-medium text-gray-900">Production</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
