"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useWorkspaceFiles } from "@/lib/use-workspace-files";
import { uploadWorkspaceFile, formatBytes } from "@/lib/upload-file";
import type { AttachmentKind, WorkspaceFile } from "@/lib/workspace-api";
import { Paperclip, Loader2, Trash2, Image as ImageIcon, FileText, FileArchive, Download, UploadCloud, X } from "lucide-react";

// Drop-in attachments panel — works as a task/note/message attachment
// shelf OR as a floating workspace file area (when attach is omitted).
// Supports click-to-upload, drag-and-drop, and clipboard paste of
// images. Picks a sensible icon per content_type and shows an inline
// preview for images.

export function WorkspaceAttachments({ workspaceId, canEdit, attach, label, className = "" }: {
  workspaceId: string;
  canEdit: boolean;
  attach?: { kind: AttachmentKind; id: string };
  label?: string;
  className?: string;
}) {
  const { files, loading, refresh, remove } = useWorkspaceFiles(workspaceId, attach);
  const [uploading, setUploading] = useState<string[]>([]); // optimistic placeholder names
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setErr(null);
    setUploading((prev) => [...prev, ...arr.map((f) => f.name)]);
    for (const f of arr) {
      try {
        const r = await uploadWorkspaceFile(workspaceId, f, attach);
        if (!r.ok) setErr(r.error);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setUploading((prev) => prev.filter((n) => n !== f.name));
      }
    }
    void refresh();
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = ""; // allow re-selecting the same file
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!canEdit) return;
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!canEdit) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  }

  return (
    <div
      className={`relative ${className}`}
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1.5">
          <Paperclip className="size-3" /> {label ?? "Attachments"} {files.length > 0 && <span className="text-foreground">· {files.length}</span>}
        </span>
        {canEdit && (
          <button
            onClick={() => inputRef.current?.click()}
            className="text-[11px] text-emerald hover:underline flex items-center gap-1"
            type="button"
          >
            <UploadCloud className="size-3" /> Add file
          </button>
        )}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onChange} />
      </div>

      {/* Drop-zone shading — only active while dragging. */}
      {dragOver && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-emerald bg-emerald/5 flex items-center justify-center text-emerald text-sm font-medium pointer-events-none">
          <UploadCloud className="size-4 mr-2" /> Drop to upload
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="size-4 text-emerald animate-spin" /></div>
      ) : files.length === 0 && uploading.length === 0 ? (
        canEdit ? (
          <p className="text-[11px] text-muted italic">Drop a file here, paste an image, or click <span className="text-foreground">Add file</span>.</p>
        ) : (
          <p className="text-[11px] text-muted italic">No files yet.</p>
        )
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => <FileRow key={f.id} file={f} canDelete={canEdit} onDelete={() => remove(f.id)} />)}
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 p-2 rounded-lg border border-emerald/30 bg-emerald/5 text-xs">
              <Loader2 className="size-3.5 text-emerald animate-spin shrink-0" />
              <span className="truncate flex-1">{name}</span>
              <span className="text-muted">Uploading…</span>
            </div>
          ))}
        </div>
      )}

      {err && <p className="mt-2 text-[11px] text-rust">Upload failed: {err}</p>}
    </div>
  );
}

function FileRow({ file, canDelete, onDelete }: { file: WorkspaceFile; canDelete: boolean; onDelete: () => void }) {
  const isImage = file.content_type.startsWith("image/");
  const Icon = isImage ? ImageIcon : file.content_type.includes("pdf") ? FileText : file.content_type.startsWith("text/") || file.content_type.includes("markdown") ? FileText : file.content_type.includes("zip") || file.content_type.includes("compressed") ? FileArchive : FileText;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="group rounded-lg border border-border bg-surface-2/30 hover:border-emerald/30 transition">
      <div className="flex items-center gap-2.5 p-2">
        <div className="size-7 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
          {isImage && file.downloadUrl ? (
            <img src={file.downloadUrl} alt="" className="size-7 object-cover rounded-md cursor-pointer" onClick={() => setPreviewOpen(true)} />
          ) : (
            <Icon className="size-3.5 text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{file.name}</div>
          <div className="text-[10px] text-muted">{formatBytes(file.size_bytes)} · {file.uploaded_by_name ?? "Member"}</div>
        </div>
        {file.downloadUrl && (
          <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer" download={file.name} className="size-6 rounded-md text-muted hover:text-emerald hover:bg-surface flex items-center justify-center transition" title="Download">
            <Download className="size-3.5" />
          </a>
        )}
        {canDelete && (
          <button
            onClick={() => { if (confirm(`Delete "${file.name}"?`)) onDelete(); }}
            className="size-6 rounded-md text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {previewOpen && file.downloadUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <button className="absolute top-4 right-4 size-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-foreground hover:bg-surface transition" onClick={() => setPreviewOpen(false)}>
            <X className="size-4" />
          </button>
          <img src={file.downloadUrl} alt={file.name} className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
