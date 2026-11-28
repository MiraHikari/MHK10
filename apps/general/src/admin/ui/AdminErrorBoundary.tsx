import { Component, type ReactNode } from 'react';
import AdminApp from './AdminApp';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <main role="alert" className="mx-auto max-w-xl p-8">
        <h1>后台暂时无法显示</h1>
        <p>请刷新页面重试。浏览器中未保存的修改需要重新输入。</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

export default function AdminErrorBoundary() {
  return (
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  );
}
