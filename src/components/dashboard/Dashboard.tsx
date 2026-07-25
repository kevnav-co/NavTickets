
import React, { Suspense } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import DashboardKPIs from './DashboardKPIs';
import { Loader2 } from 'lucide-react';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Lazy load the heavy components
const GlobalCalendar = React.lazy(() => import('./GlobalCalendar'));
const UserActivityChart = React.lazy(() => import('./UserActivityChart'));
const WeeklyProductivityChart = React.lazy(() => import('./WeeklyProductivityChart'));
const MonthlyProductivityChart = React.lazy(() => import('./MonthlyProductivityChart'));
const IntelligenceEngine = React.lazy(() => import('./IntelligenceEngine'));

const LoadingFallback: React.FC<{ height?: string }> = ({ height = 'h-96' }) => (
  <div className={`w-full bg-gray-50 rounded-3xl flex items-center justify-center ${height}`}>
    <Loader2 className="animate-spin text-gray-300" size={48} />
  </div>
);

const Dashboard: React.FC = () => {
  const { orders, clients, users } = useData();
  const { currentUser } = useAuth();

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20 mx-auto max-w-7xl">
      
      <DashboardKPIs />

      <Suspense fallback={<LoadingFallback height="h-[500px]" />}>
        <GlobalCalendar />
      </Suspense>

      {currentUser && hasPermission(currentUser.role, PERMISSIONS.VIEW_ADMIN_WIDGETS) && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Suspense fallback={<LoadingFallback />}>
              <UserActivityChart orders={orders} users={users} />
            </Suspense>
            <div className="space-y-6">
              <Suspense fallback={<LoadingFallback />}>
                <WeeklyProductivityChart orders={orders} users={users} />
              </Suspense>
              <Suspense fallback={<LoadingFallback />}>
                <MonthlyProductivityChart orders={orders} users={users} />
              </Suspense>
            </div>
          </div>

          <Suspense fallback={null}> 
            <IntelligenceEngine clients={clients} />
          </Suspense>
        </>
      )}
      
    </div>
  );
};

export default Dashboard;
