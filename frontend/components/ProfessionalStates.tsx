import { Loader2, AlertCircle, CheckCircle, Info, Wallet, Search } from 'lucide-react';

interface ProfessionalLoadingProps {
  message: string;
  progress?: number;
}

export function ProfessionalLoading({ message, progress }: ProfessionalLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 bg-[#161B22] rounded-xl border border-[#21262D]">
      <div className="relative">
        <Loader2 className="h-12 w-12 text-[#58A6FF] animate-spin" />
        {progress && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-[#8B949E]">{progress}%</span>
          </div>
        )}
      </div>
      <p className="mt-4 text-lg text-[#E6EDF3] font-medium">
        {message}
      </p>
      {progress !== undefined && (
        <div className="mt-4 w-64 bg-[#21262D] rounded-full h-2">
          <div 
            className="bg-[#58A6FF] h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface ProfessionalEmptyStateProps {
  title: string;
  message: string;
  action?: string;
  icon?: 'wallet' | 'search' | 'info';
}

export function ProfessionalEmptyState({ title, message, action, icon = 'info' }: ProfessionalEmptyStateProps) {
  const IconComponent = icon === 'wallet' ? Wallet : icon === 'search' ? Search : Info;
  
  return (
    <div className="text-center py-12 bg-[#161B22] rounded-xl border border-[#21262D]">
      <IconComponent className="h-16 w-16 text-[#58A6FF] mx-auto mb-4" />
      <h3 className="text-2xl font-bold text-[#E6EDF3] mb-4">
        {title}
      </h3>
      <p className="text-lg text-[#8B949E] mb-6 max-w-md mx-auto">
        {message}
      </p>
      {action && (
        <p className="text-sm text-[#8B949E]">
          {action}
        </p>
      )}
    </div>
  );
}

interface ProfessionalErrorStateProps {
  error: string;
  retryAction: () => void;
  supportInfo?: string;
}

export function ProfessionalErrorState({ error, retryAction, supportInfo }: ProfessionalErrorStateProps) {
  return (
    <div className="text-center py-12 bg-[#161B22] rounded-xl border border-[#21262D]">
      <AlertCircle className="h-16 w-16 text-[#F85149] mx-auto mb-4" />
      <h3 className="text-2xl font-bold text-[#E6EDF3] mb-4">
        Analysis Failed
      </h3>
      <p className="text-lg text-[#8B949E] mb-6 max-w-md mx-auto">
        {error || 'Unable to analyze portfolio positions.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={retryAction}
          className="px-6 py-3 bg-[#58A6FF] text-[#0D1117] font-semibold rounded-lg hover:bg-[#79C0FF] transition-colors"
        >
          Try Again
        </button>
      </div>
      {supportInfo && (
        <p className="text-sm text-[#8B949E] mt-4">
          {supportInfo}
        </p>
      )}
    </div>
  );
}

interface ProfessionalSuccessStateProps {
  title: string;
  summary: string;
  nextAction: string;
}

export function ProfessionalSuccessState({ title, summary, nextAction }: ProfessionalSuccessStateProps) {
  return (
    <div className="text-center py-12 bg-[#161B22] rounded-xl border border-[#21262D]">
      <CheckCircle className="h-16 w-16 text-[#3FB950] mx-auto mb-4" />
      <h3 className="text-2xl font-bold text-[#E6EDF3] mb-4">
        {title}
      </h3>
      <p className="text-lg text-[#8B949E] mb-6 max-w-md mx-auto">
        {summary}
      </p>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="px-6 py-3 bg-[#3FB950] text-[#0D1117] font-semibold rounded-lg hover:bg-[#57D173] transition-colors"
      >
        {nextAction}
      </button>
    </div>
  );
}
