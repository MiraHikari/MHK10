import { Fragment, useEffect, useState } from 'react';
import { profile } from '@/data/profile';
import {
  PRIVACY_SECTIONS,
  STORAGE_KEY_PURPOSES,
  STORAGE_TABLE_HEADERS,
  STORAGE_TABLE_TITLES,
  storageCatalogEntries,
  type Localized,
  type PrivacyLang,
} from '@/data/privacy';
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/storage/keys';

const DEFAULT_HTML_LANG = 'zh-CN';

/** 语言按钮配置（value → 可见标签） */
const LANG_OPTIONS: ReadonlyArray<readonly [PrivacyLang, string]> = [
  ['zh', '中文'],
  ['en', 'EN'],
];

/**
 * 渲染数据源文本：`` `code` `` 反引号片段 → <code>；`{email}` 占位符 →
 * mailto 链接（非联系段落不含该 token，自然透传）。数据源不持有 JSX。
 */
function renderRich(text: string, email: string, prefix: string) {
  const parts = text.split(/`([^`]+)`|({email})/g);
  return parts.map((part, index) => {
    if (part === '{email}') {
      return (
        <a key={`${prefix}-${index}`} href={`mailto:${email}`}>
          {email}
        </a>
      );
    }
    return index % 3 === 1 ? (
      <code key={`${prefix}-${index}`}>{part}</code>
    ) : (
      <Fragment key={`${prefix}-${index}`}>{part}</Fragment>
    );
  });
}

/**
 * 隐私说明正文：按浏览器语言自动显示中文或英文，可手动切换并记忆
 * （`mirahikari-portfolio:pref:privacy-lang`）。SSR 渲染中文首帧，
 * 挂载后按保存值 / `navigator.language` 校正，避免水合不一致。
 * 本机存储表格从 `STORAGE_CATALOG` 自动派生。
 */
export default function PrivacyArticle() {
  const [lang, setLang] = useState<PrivacyLang>('zh');

  useEffect(() => {
    const saved = readStorage(STORAGE_KEYS.privacyLang);
    const detected: PrivacyLang =
      saved === 'en' || saved === 'zh'
        ? saved
        : navigator.language.toLowerCase().startsWith('zh')
          ? 'zh'
          : 'en';
    setLang(detected);
  }, []);

  // 语言切换同步 <html lang>（卸载恢复站点默认）。
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    return () => {
      document.documentElement.lang = DEFAULT_HTML_LANG;
    };
  }, [lang]);

  const changeLang = (next: PrivacyLang) => {
    setLang(next);
    writeStorage(STORAGE_KEYS.privacyLang, next);
  };

  const pick = (localized: Localized) => localized[lang];
  const headers = STORAGE_TABLE_HEADERS[lang];

  return (
    <div className="prose-mh privacy-article">
      <div className="privacy-lang-switch" role="group" aria-label="语言 / Language">
        {LANG_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={lang === value ? 'is-active' : undefined}
            aria-pressed={lang === value}
            onClick={() => changeLang(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.id}>
          {section.title && <h2>{pick(section.title)}</h2>}
          {section.paragraphs?.map((paragraph, index) => (
            <p key={index}>
              {renderRich(pick(paragraph), profile.email, `${section.id}-${index}`)}
            </p>
          ))}
          {section.listItems && (
            <ul>
              {section.listItems.map((item, index) => (
                <li key={index}>
                  {renderRich(pick(item), profile.email, `${section.id}-li-${index}`)}
                </li>
              ))}
            </ul>
          )}
          {section.tableAudience && (
            <>
              <p className="privacy-table-title">
                {STORAGE_TABLE_TITLES[lang][section.tableAudience]}
              </p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{headers.kind}</th>
                    <th scope="col">{headers.key}</th>
                    <th scope="col">{headers.purpose}</th>
                  </tr>
                </thead>
                <tbody>
                  {storageCatalogEntries(section.tableAudience).map((entry) => {
                    const copy = STORAGE_KEY_PURPOSES[entry.key];
                    if (!copy) return null;
                    return (
                      <tr key={entry.key}>
                        <td>{pick(copy.kind)}</td>
                        <td>
                          <code>{entry.key}</code>
                        </td>
                        <td>{pick(copy.purpose)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
