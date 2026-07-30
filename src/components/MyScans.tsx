import type { CloudDocument } from "../cloudStorage";

interface MyScansProps {
  scans: CloudDocument[];
  loading: boolean;
  deletingDocId: string | null;
  onDownload: (doc: CloudDocument) => void;
  onDelete: (docId: string) => void;
  onClose: () => void;
}

export function MyScans({
  scans,
  loading,
  deletingDocId,
  onDownload,
  onDelete,
  onClose,
}: MyScansProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-200">My Scans</h3>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Close
        </button>
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
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {scans.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-indigo-900/50 text-indigo-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="truncate text-sm font-medium text-gray-200">
                  {doc.name}
                </p>
                <p className="text-xs text-gray-500">
                  {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"} · {new Date(doc.date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDownload(doc)}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                  title="Download"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
