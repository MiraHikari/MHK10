import { useState } from 'react';
import { Button, Card, FieldRow, Spinner, TextInput } from '@/admin/ui/primitives';
import { GitHubError, setStoredToken, validateToken } from '@/admin/github/client';
import {
  R2Error,
  setStoredCredentials,
  normalizeR2Endpoint,
  validateCredentials,
} from '@/admin/r2/client';

export interface LoginGateProps {
  onSuccess: () => void;
}

export function LoginGate({ onSuccess }: LoginGateProps) {
  const [token, setToken] = useState('');
  const [r2Endpoint, setR2Endpoint] = useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const r2Filled = Boolean(r2Endpoint.trim() && r2AccessKeyId.trim() && r2SecretAccessKey.trim());
  const r2Partial = Boolean(r2Endpoint.trim() || r2AccessKeyId.trim() || r2SecretAccessKey.trim());

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError(null);
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError('请输入 GitHub PAT');
      return;
    }
    if (r2Partial && !r2Filled) {
      setError('R2 凭据需同时填写 endpoint、accessKeyId 与 secretAccessKey');
      return;
    }

    setLoading(true);
    try {
      await validateToken(trimmedToken);

      if (r2Filled) {
        const credentials = {
          endpoint: normalizeR2Endpoint(r2Endpoint),
          accessKeyId: r2AccessKeyId.trim(),
          secretAccessKey: r2SecretAccessKey.trim(),
        };
        await validateCredentials(credentials);
        setStoredCredentials(credentials);
      }

      // Persist credentials only after every configured service has passed.
      setStoredToken(trimmedToken);
      onSuccess();
    } catch (err) {
      if (err instanceof GitHubError || err instanceof R2Error) {
        setError(err.message);
      } else {
        setError('验证失败，请检查网络后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-zinc-100">内容管理后台</h1>
        <p className="mt-2 text-sm text-zinc-400">
          使用 GitHub fine-grained 个人访问令牌登录，以直接读写仓库内容。
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <FieldRow label="GitHub PAT" htmlFor="login-pat" required>
            <TextInput
              id="login-pat"
              value={token}
              placeholder="github_pat_…"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              onChange={setToken}
            />
          </FieldRow>

          <div className="pt-4 border-t border-white/10 space-y-4">
            <p className="text-sm font-medium text-zinc-300">R2 图片存储凭据（可选）</p>

            <FieldRow
              label="R2 Endpoint"
              htmlFor="login-r2-endpoint"
              help="S3 兼容 endpoint，bucket 已内嵌"
            >
              <TextInput
                id="login-r2-endpoint"
                value={r2Endpoint}
                placeholder="https://…"
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
                onChange={setR2Endpoint}
              />
            </FieldRow>

            <FieldRow label="R2 Access Key ID" htmlFor="login-r2-access-key">
              <TextInput
                id="login-r2-access-key"
                value={r2AccessKeyId}
                placeholder="…"
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
                onChange={setR2AccessKeyId}
              />
            </FieldRow>

            <FieldRow label="R2 Secret Access Key" htmlFor="login-r2-secret">
              <TextInput
                id="login-r2-secret"
                value={r2SecretAccessKey}
                placeholder="…"
                disabled={loading}
                type="password"
                autoComplete="new-password"
                onChange={setR2SecretAccessKey}
              />
            </FieldRow>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading || !token.trim()} className="w-full">
            {loading && <Spinner className="mr-2" />}
            验证并登录
          </Button>
        </form>

        <div className="mt-6 rounded-lg bg-zinc-900/80 p-4 text-sm text-zinc-400 space-y-2">
          <p className="font-medium text-zinc-300">如何创建 PAT</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>访问 GitHub Settings → Developer settings</li>
            <li>选择 Personal access tokens → Fine-grained tokens</li>
            <li>点击 Generate new token</li>
            <li>
              仅授权仓库{' '}
              <strong className="text-zinc-300">example-owner/example-content-repo</strong>
            </li>
            <li>
              权限中勾选 <strong className="text-zinc-300">Contents: Read and write</strong>
            </li>
          </ol>
          <p>
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 underline"
            >
              前往创建 PAT →
            </a>
          </p>
          <p className="text-xs text-zinc-500 pt-1">
            PAT 与 R2 凭据均仅保存在当前浏览器的 localStorage 中，不会上传到除 api.github.com 与 R2
            endpoint 之外的任何服务。
          </p>
        </div>
      </Card>
    </div>
  );
}
