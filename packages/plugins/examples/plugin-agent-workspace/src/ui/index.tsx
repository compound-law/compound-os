import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useMemo, useState } from "react";

type FsEntry = {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number | null;
};

type DirectoryResponse = {
  exists: boolean;
  root: string | null;
  path: string;
  entries: FsEntry[];
  truncated: boolean;
  error?: string;
};

type FileResponse = {
  content: string | null;
  size: number;
  binary: boolean;
  truncated: boolean;
  path: string;
  error?: string;
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return `${parent}/${name}`;
}

/**
 * Directory row that can expand to reveal its children. Children are
 * lazy-loaded with usePluginData when the row is expanded.
 */
function DirectoryRow({
  agentId,
  companyId,
  parentPath,
  entry,
  selected,
  onSelect,
  depth,
}: {
  agentId: string;
  companyId: string;
  parentPath: string;
  entry: FsEntry;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullPath = joinPath(parentPath, entry.name);

  return (
    <>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: "8px",
          paddingTop: "3px",
          paddingBottom: "3px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "13px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          userSelect: "none",
        }}
      >
        <span style={{ width: "12px", display: "inline-block", color: "var(--muted-foreground, #888)" }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={{ color: "var(--muted-foreground, #888)" }}>📁</span>
        <span>{entry.name}</span>
      </div>
      {expanded && (
        <DirectoryChildren
          agentId={agentId}
          companyId={companyId}
          parentPath={fullPath}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </>
  );
}

/**
 * Renders the children of a directory by lazy-loading its listing from the
 * plugin worker. Preserves filesystem order from the worker response.
 */
function DirectoryChildren({
  agentId,
  companyId,
  parentPath,
  selected,
  onSelect,
  depth,
}: {
  agentId: string;
  companyId: string;
  parentPath: string;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const { data, loading } = usePluginData<DirectoryResponse>("listDirectory", {
    agentId,
    companyId,
    path: parentPath,
  });

  if (loading) {
    return (
      <div
        style={{
          paddingLeft: `${depth * 14 + 24}px`,
          fontSize: "12px",
          color: "var(--muted-foreground, #888)",
          paddingTop: "3px",
          paddingBottom: "3px",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!data) return null;

  if (data.error) {
    return (
      <div
        style={{
          paddingLeft: `${depth * 14 + 24}px`,
          fontSize: "12px",
          color: "var(--destructive, #cc3030)",
          paddingTop: "3px",
          paddingBottom: "3px",
        }}
      >
        {data.error}
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <div
        style={{
          paddingLeft: `${depth * 14 + 24}px`,
          fontSize: "12px",
          color: "var(--muted-foreground, #888)",
          paddingTop: "3px",
          paddingBottom: "3px",
          fontStyle: "italic",
        }}
      >
        (empty)
      </div>
    );
  }

  return (
    <>
      {data.entries.map((entry) => {
        const fullPath = joinPath(parentPath, entry.name);
        if (entry.type === "directory") {
          return (
            <DirectoryRow
              key={fullPath}
              agentId={agentId}
              companyId={companyId}
              parentPath={parentPath}
              entry={entry}
              selected={selected}
              onSelect={onSelect}
              depth={depth}
            />
          );
        }
        const isSelected = selected === fullPath;
        return (
          <div
            key={fullPath}
            onClick={() => onSelect(fullPath)}
            style={{
              paddingLeft: `${depth * 14 + 24}px`,
              paddingRight: "8px",
              paddingTop: "3px",
              paddingBottom: "3px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "13px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              background: isSelected ? "var(--accent, #e5e7eb)" : "transparent",
              color: isSelected ? "var(--accent-foreground, inherit)" : "inherit",
              userSelect: "none",
            }}
          >
            <span style={{ color: "var(--muted-foreground, #888)" }}>
              {entry.type === "symlink" ? "🔗" : "📄"}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.name}
            </span>
            {entry.size != null && (
              <span style={{ color: "var(--muted-foreground, #888)", fontSize: "11px" }}>
                {formatSize(entry.size)}
              </span>
            )}
          </div>
        );
      })}
      {data.truncated && (
        <div
          style={{
            paddingLeft: `${depth * 14 + 24}px`,
            fontSize: "11px",
            color: "var(--muted-foreground, #888)",
            paddingTop: "3px",
            paddingBottom: "3px",
            fontStyle: "italic",
          }}
        >
          (more entries hidden — directory truncated)
        </div>
      )}
    </>
  );
}

/**
 * File preview pane on the right. Shows the selected file's contents.
 */
function FilePreview({
  agentId,
  companyId,
  path,
}: {
  agentId: string;
  companyId: string;
  path: string | null;
}) {
  if (!path) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted-foreground, #888)",
          fontSize: "13px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        Select a file to preview
      </div>
    );
  }

  return <FilePreviewContent agentId={agentId} companyId={companyId} path={path} />;
}

function FilePreviewContent({
  agentId,
  companyId,
  path,
}: {
  agentId: string;
  companyId: string;
  path: string;
}) {
  const { data, loading } = usePluginData<FileResponse>("readFile", {
    agentId,
    companyId,
    path,
  });

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted-foreground, #888)",
          fontSize: "13px",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!data) return null;

  if (data.error) {
    return (
      <div style={{ padding: "16px", color: "var(--destructive, #cc3030)", fontSize: "13px" }}>
        {data.error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border, #e5e7eb)",
          fontSize: "12px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          background: "var(--muted, #f9fafb)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.path}
        </span>
        <span style={{ color: "var(--muted-foreground, #888)", flexShrink: 0 }}>
          {formatSize(data.size)}
          {data.truncated && " (first 1MB)"}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", background: "var(--background, #fff)" }}>
        {data.binary ? (
          <div style={{ padding: "16px", color: "var(--muted-foreground, #888)", fontSize: "13px", fontStyle: "italic" }}>
            Binary file — preview not supported.
          </div>
        ) : data.content == null ? (
          <div style={{ padding: "16px", color: "var(--muted-foreground, #888)", fontSize: "13px", fontStyle: "italic" }}>
            No content.
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: "12px 16px",
              fontSize: "12px",
              lineHeight: "1.55",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre",
              overflow: "auto",
            }}
          >
            {data.content}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Main tab component. Loaded by the Paperclip UI into the agent detail page.
 */
export function WorkspaceTab({ context }: PluginDetailTabProps) {
  const agentId = context.entityId;
  const companyId = context.companyId;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (!companyId) {
    return (
      <div style={{ padding: "24px", fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
        No company context available.
      </div>
    );
  }

  // Load root directory first so we can show a reasonable empty state
  const { data: root, loading: isLoading } = usePluginData<DirectoryResponse>("listDirectory", {
    agentId,
    companyId,
    path: "",
  });

  const treePane = useMemo(
    () => (
      <div
        style={{
          flex: "0 0 320px",
          borderRight: "1px solid var(--border, #e5e7eb)",
          overflow: "auto",
          background: "var(--card, #fafafa)",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
            fontSize: "12px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--muted-foreground, #666)",
          }}
        >
          Workspace
        </div>
        {isLoading && (
          <div style={{ padding: "16px", fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
            Loading…
          </div>
        )}
        {!isLoading && root && !root.exists && (
          <div style={{ padding: "16px", fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
            This agent hasn't created any workspace files yet.
          </div>
        )}
        {!isLoading && root && root.error && (
          <div style={{ padding: "16px", fontSize: "13px", color: "var(--destructive, #cc3030)" }}>
            {root.error}
          </div>
        )}
        {!isLoading && root && root.exists && !root.error && (
          <div style={{ paddingTop: "6px", paddingBottom: "10px" }}>
            <DirectoryChildren
              agentId={agentId}
              companyId={companyId}
              parentPath=""
              selected={selectedFile}
              onSelect={setSelectedFile}
              depth={0}
            />
          </div>
        )}
      </div>
    ),
    [agentId, companyId, isLoading, root, selectedFile],
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "480px" }}>
      {treePane}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <FilePreview agentId={agentId} companyId={companyId} path={selectedFile} />
      </div>
    </div>
  );
}
