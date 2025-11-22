import { ApiError } from '@/lib/types';

interface ErrorMessageProps {
  error: ApiError;
}

export default function ErrorMessage({ error }: ErrorMessageProps) {
  const getErrorIcon = () => {
    switch (error.error_code) {
      case 'RATE_LIMITED':
        return '⏱️';
      case 'INVALID_ADDRESS':
        return '❌';
      case 'SERVICE_UNAVAILABLE':
        return '🔧';
      default:
        return '⚠️';
    }
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 my-6">
      <div className="flex items-start">
        <span className="text-3xl mr-3">{getErrorIcon()}</span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900 mb-1">
            {error.error_code.replace(/_/g, ' ')}
          </h3>
          <p className="text-red-700">{error.message}</p>
          {error.retry_after && (
            <p className="text-sm text-red-600 mt-2">
              Please try again in {error.retry_after} seconds
            </p>
          )}
          {error.details && (
            <details className="mt-3">
              <summary className="text-sm text-red-600 cursor-pointer hover:text-red-800">
                Technical details
              </summary>
              <p className="text-xs text-red-500 mt-2 font-mono bg-red-100 p-2 rounded">
                {error.details}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
