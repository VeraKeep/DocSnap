import { useState } from "react";
import {
  type CloudDocument,
  type DocCategory,
  ALL_CATEGORIES,
  getDocCategory,
} from "../cloudTypes";
import { DocumentSearch } from "./DocumentSearch";
import { ShareDialog } from "./ShareDialog";

// ── Folder config ──────────────────────────────────────────────────

interface FolderConfig {
  category: DocCategory;
  emoji: string;
  label: string;
  badgeColor: string; // Tailwind classes for the badge
  badgeBg: string;
  iconBg: string;
  iconColor: string;
}

const FOLDER_CONFIGS: Record<DocCategory, FolderConfig> = {
  Receipts: {
    category: "Receipts",
    emoji: "📄",
    label: "Receipts",
    badgeColor: "bg-emerald-900/60 text-emerald-400 border-emerald-700/60",
    badgeBg: "bg-emerald-900/50",
    iconBg: "bg-emerald-900/40",
    iconColor: "text-emerald-400",
  },
  Insurance: {
    category: "Insurance",
    emoji: "🛡️",
    label: "Insurance",
    badgeColor: "bg-blue-900/60 text-blue-400 border-blue-700/60",
    badgeBg: "bg-blue-900/50",
    iconBg: "bg-blue-900/40",
    iconColor: "text-blue-400",
  },
  Taxes: {
    category: "Taxes",
    emoji: "💰",
    label: "Taxes",
    badgeColor: "bg-red-900/60 text-red-400 border-red-700/60",
    badgeBg: "bg-red-900/50",
    iconBg: "bg-red-900/40",
    iconColor: "text-red-400",
  },
  Medical: {
    category: "Medical",
    emoji: "🏥",
    label: "Medical",
    badgeColor: "bg-purple-900/60 text-purple-400 border-purple-700/60",
    badgeBg: "bg-purple-900/50",
    iconBg: "bg-purple-900/40",
    iconColor: "text-purple-400",
  },
  School: {
    category: "School",
    emoji: "🎓",
    label: "School",
    badgeColor: "bg-orange-900/60 text-orange-400 border-orange-700/60",
    badgeBg: "bg-orange-900/50",
    iconBg: "bg-orange-900/40",
    iconColor: "text-orange-400",
  },
  Military: {
    category: "Military",
    emoji: "🪖",
    label: "Military",
    badgeColor: "bg-lime-900/60 text-lime-400 border-lime-700/60",
    badgeBg: "bg-lime-900/50",
    iconBg: "bg-lime-900/40",
    iconColor: "text-lime-400",
  },
  Manuals: {
    category: "Manuals",
    emoji: "📖",
    label: "Manuals",
    badgeColor: "bg-gray-800 text-gray-300 border-gray-700",
    badgeBg: "bg-gray-800/80",
    iconBg: "bg-gray-800/60",
    iconColor: "text-gray-300",
  },
  Uncategorized: {
    category: "Uncategorized",
    emoji: "📁",
    label: "Uncategorized",
    badgeColor: "bg-gray-800/60 text-gray-500 border-gray-700/60",
    badgeBg: "bg-gray-800/40",
    iconBg: "bg-gray-800/40",
    iconColor: "text-gray-500",
  },
};

// ── Category badge component ────────────────────────────────────────


// ── Category picker dropdown ────────────────────────────────────────

function CategoryPicker({
  current,
  onChange,
}: {
  current: DocCategory;
  onChange: (cat: DocCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = FOLDER_CONFIGS[current];

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition hover:opacity-80 ${cfg.badgeColor}`}
        title="Change category"
      >
        <span className="text-[11px] leading-none">{cfg.emoji}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3 opacity-60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
            {ALL_CATEGORIES.map((cat) => {
              const c = FOLDER_CONFIGS[cat];
              return (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(cat);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                    cat === current
                      ? "bg-indigo-600/20 text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <span className="text-sm">{c.emoji}</span>
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Document card ───────────────────────────────────────────────────

function DocCard({
  doc,
  deletingDocId,
  onDownload,
  onDelete,
  onCategoryChange,
  onShare,
}: {
  doc: CloudDocument;
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
  onCategoryChange: (docId: string, cat: DocCategory) => void;
  onShare: (doc: CloudDocument) => void;
}) {
  const category = getDocCategory(doc);
  const cfg = FOLDER_CONFIGS[category];
  const duplicateCount = (doc as CloudDocument & { duplicateCount?: number }).duplicateCount ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3 transition hover:border-gray-700">
      {/* Thumbnail icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded ${cfg.iconBg} ${cfg.iconColor}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
      </div>

      {/* Name + date + badge */}
      <div className="flex-1 min-w-0 text-left">
        <p className="truncate text-sm font-medium text-gray-200">
        {doc.name}
        </p>
        {duplicateCount > 0 && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-700/50 bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-300" title="Duplicate group">
          ⚠ {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"} found
        </span>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-xs text-gray-500">
            {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"} ·{" "}
            {new Date(doc.date).toLocaleDateString()}
          </p>
          <CategoryPicker
            current={category}
            onChange={(cat) => onCategoryChange(doc.id, cat)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onDownload(doc)}
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          title="Download"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </button>
        <button
          onClick={() => onShare(doc)}
          className="rounded p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          title="Share"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(doc.id)}
          disabled={deletingDocId === doc.id}
          className="rounded p-1.5 text-gray-400 transition hover:bg-red-900/50 hover:text-red-400 disabled:opacity-50"
          title="Delete"
        >
          {deletingDocId === doc.id ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main MyScans component ──────────────────────────────────────────

interface MyScansProps {
  scans: CloudDocument[];
  loading: boolean;
  deletingDocId: string | null;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** Whether the user has a Pro subscription */
  isPro: boolean;
  /** URL to upgrade/pricing page */
  upgradeUrl: string;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
  onClose: () => void;
  onCategoryChange: (docId: string, cat: DocCategory) => void;
}

export function MyScans({
  scans,
  loading,
  deletingDocId,
  docLimit,
  isPro,
  upgradeUrl,
  onDownload,
  onDelete,
  onClose,
  onCategoryChange,
}: MyScansProps) {
  // Track which folders are expanded. Default: all expanded.
  const [collapsed, setCollapsed] = useState<Set<DocCategory>>(new Set());
  // Track whether search mode is active
  const [searchMode, setSearchMode] = useState(false);
  // Document currently being shared (opens ShareDialog)
  const [shareDoc, setShareDoc] = useState<CloudDocument | null>(null);

  const docCountDisplay = isPro
    ? `${scans.length} documents · Unlimited`
    : `${scans.length} / ${docLimit} documents`;

  // Group scans by effective category
  const grouped = new Map<DocCategory, CloudDocument[]>();
  for (const cat of ALL_CATEGORIES) {
    grouped.set(cat, []);
  }
  for (const doc of scans) {
    const cat = getDocCategory(doc);
    grouped.get(cat)!.push(doc);
  }

  const toggleFolder = (cat: DocCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // If search mode is active, show the search interface
  if (searchMode) {
    return (
      <div className="space-y-4">
        <DocumentSearch
          scans={scans}
          deletingDocId={deletingDocId}
          onDownload={onDownload}
          onDelete={onDelete}
          onClear={() => setSearchMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-200">My Scans</h3>
          <p className={`text-xs mt-0.5 ${isPro ? "text-indigo-400" : "text-gray-500"}`}>
            {docCountDisplay}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button
            onClick={() => setSearchMode(true)}
            className="rounded p-1.5 text-gray-500 transition hover:text-gray-300 hover:bg-gray-800"
            title="Search documents"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : scans.length === 0 ? (
        <p className="py-6 text-sm text-gray-500">
          No saved documents yet. Scan and save your first document!
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {ALL_CATEGORIES.map((cat) => {
            const docs = grouped.get(cat) || [];
            const cfg = FOLDER_CONFIGS[cat];
            const isCollapsed = collapsed.has(cat);
            // Empty folders: only show if expanded
            const isEmpty = docs.length === 0;
            if (isEmpty && isCollapsed) return null;

            return (
              <div key={cat} className="rounded-lg border border-gray-800/50">
                {/* Folder header */}
                <button
                  onClick={() => toggleFolder(cat)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-900/40 ${
                    !isEmpty ? "cursor-pointer" : ""
                  }`}
                >
                  {/* Expand/collapse chevron */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
                      isCollapsed ? "" : "rotate-90"
                    } ${isEmpty ? "invisible" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>

                  {/* Folder icon */}
                  <span className="text-lg">{cfg.emoji}</span>

                  {/* Folder name */}
                  <span className="flex-1 text-sm font-medium text-gray-200">
                    {cfg.label}
                  </span>

                  {/* Document count */}
                  <span className="text-xs text-gray-500">
                    {docs.length}
                  </span>
                </button>

                {/* Folder contents */}
                {!isCollapsed && (
                  <div className="border-t border-gray-800/30 px-2 pb-2 pt-1">
                    {isEmpty ? (
                      <p className="px-2 py-3 text-xs text-gray-600">
                        No documents yet
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {docs.map((doc) => (
                          <DocCard
                            key={doc.id}
                            doc={doc}
                            deletingDocId={deletingDocId}
                            onDownload={onDownload}
                            onDelete={onDelete}
                            onCategoryChange={onCategoryChange}
                            onShare={(d) => setShareDoc(d)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {shareDoc && (
        <ShareDialog
          doc={shareDoc}
          isPro={isPro}
          upgradeUrl={upgradeUrl}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
}
