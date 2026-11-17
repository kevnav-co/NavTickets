
import React, { Suspense } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import DashboardKPIs from './DashboardKPIs';
import WhenVisible from '../ui/WhenVisible';
import { Loader2 } from 'lucide-react';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Lazy load the heavy components
const GlobalCalendar = React.lazy(() => import('./GlobalCalendar'));
const UserActivityChart = React.lazy(() => import('./UserActivityChart'));
const WeeklyProductivityChart = React.lazy(() => import('./WeeklyProductivityChart'));
const MonthlyProductivityChart = React.lazy(() => import('./MonthlyProductivityChart'));
const IntelligenceEngine = React.lazy(() => import('./IntelligenceEngine'));

const LoadingFallback: React.FC<{ height?: string }> = ({ height = 'h-96' }) => (
  <div className={`w-full bg-sunken border border-line-soft rounded-xl flex items-center justify-center ${height}`}>
    <Loader2 className="animate-spin text-ink-faint" size={32} />
  </div>
);

const Dashboard: React.FC = () => {
  const { orders, clients, users } = useData();
  const { currentUser } = useAuth();
  const { company } = useCompany();

  return (
    <div className="p-4 md:p-6 space-y-5 md:space-y-6 pb-24 mx-auto max-w-7xl animate-fade-in-up">

      <DashboardKPIs />

      <Suspense fallback={<LoadingFallback height="h-[500px]" />}>
        <GlobalCalendar />
      </Suspense>

      {currentUser && hasPermission(currentUser.role, PERMISSIONS.VIEW_ADMIN_WIDGETS) && (
        <>
          {/* Las tres gráficas comparten recharts, con diferencia la dependencia
              más pesada de la pantalla. Quedan bajo el pliegue, así que se montan
              al desplazarse hasta ellas y no al entrar al tablero. */}
          <WhenVisible minHeight="24rem" placeholder={<LoadingFallback />}>
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
          </WhenVisible>

          {company?.features?.excelUpload !== false && (
            <WhenVisible minHeight="8rem">
              <Suspense fallback={null}>
                <IntelligenceEngine clients={clients} />
              </Suspense>
            </WhenVisible>
          )}
        </>
      )}
      
    </div>
  );
};

export default Dashboard;
