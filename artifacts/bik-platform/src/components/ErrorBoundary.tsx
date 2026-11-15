import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 rtl font-arabic">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md w-full text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-amber-700/20 bg-amber-50 text-lg font-bold text-amber-800">!</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">حدث خطأ غير متوقع</h1>
            <p className="text-slate-600 mb-6 text-sm leading-relaxed">
              واجه التطبيق مشكلة تقنية غير متوقعة أثناء عرض هذه الصفحة. الرجاء المحاولة مجدداً.
            </p>
            {this.state.error && (
              <p className="text-slate-500 text-xs leading-relaxed mb-6">
                يمكنك إعادة المحاولة؛ وإن تكرر الخطأ فتواصل مع المستشار.
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#EF4444] hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-md hover:shadow-lg"
            >
              إعادة محاولة التشغيل
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
