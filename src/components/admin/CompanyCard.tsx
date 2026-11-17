import React from 'react';
import { Eye, Users, Edit3, Trash2, Lock, CheckCircle } from 'lucide-react';
import { CompanyConfig } from '../../types/company';

interface CompanyCardProps {
  company: CompanyConfig & {
    status?: 'active' | 'suspended';
    userCount?: number;
    lastActivityAt?: string;
  };
  onEdit: (id: string) => void;
  onManageUsers: (id: string) => void;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  deleteConfirm?: string | null;
  setDeleteConfirm: (id: string | null) => void;
}

const CompanyCard: React.FC<CompanyCardProps> = ({
  company,
  onEdit,
  onManageUsers,
  onPreview,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
}) => {
  const isActive = company.status !== 'suspended';
  const statusText = isActive ? 'Activa' : 'Suspendida';
  const statusIcon = isActive ? <CheckCircle size={14} /> : <Lock size={14} />;
  const statusClass = isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

  const getLastActivityText = () => {
    if (!company.lastActivityAt) return 'Sin actividad';
    const date = new Date(company.lastActivityAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'hace un momento';
    if (diffMins < 60) return `hace ${diffMins}m`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-raised rounded-2xl shadow-sm border border-line-soft p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm"
          style={{ backgroundColor: company.theme?.primaryColor || '#7b1113' }}
        >
          {company.name?.charAt(0)?.toUpperCase() || '?'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-ink truncate">{company.name}</h3>
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
            >
              {statusIcon}
              {statusText}
            </span>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-3 text-xs text-ink-soft mb-3">
            <div>
              <span className="block text-ink-faint text-[10px] uppercase tracking-wider">Slug</span>
              <span className="font-mono text-ink-soft">{company.slug || '—'}</span>
            </div>
            <div>
              <span className="block text-ink-faint text-[10px] uppercase tracking-wider">Usuarios</span>
              <span className="font-semibold text-ink-soft">{company.userCount ?? '—'}</span>
            </div>
            <div>
              <span className="block text-ink-faint text-[10px] uppercase tracking-wider">Actividad</span>
              <span className="text-ink-soft">{getLastActivityText()}</span>
            </div>
          </div>

          {/* Company ID */}
          <span className="inline-block bg-sunken px-2 py-0.5 rounded-full font-mono text-[10px] text-ink-soft">
            ID: {company.id?.substring(0, 8)}...
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onPreview(company.id)}
            className="p-2 text-ink-faint hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Previsualizar como admin"
          >
            <Eye size={18} />
          </button>
          <button
            onClick={() => onManageUsers(company.id)}
            className="p-2 text-ink-faint hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Gestionar usuarios"
          >
            <Users size={18} />
          </button>
          <button
            onClick={() => onEdit(company.id)}
            className="p-2 text-ink-faint hover:text-primary hover:bg-red-50 rounded-lg transition-colors"
            title="Editar empresa"
          >
            <Edit3 size={18} />
          </button>
          {deleteConfirm === company.id ? (
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-line">
              <button
                onClick={() => onDelete(company.id)}
                className="px-2 py-1 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-2 py-1 text-xs text-ink-soft bg-sunken rounded-lg hover:bg-line transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(company.id)}
              className="p-2 text-ink-faint hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar empresa"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
