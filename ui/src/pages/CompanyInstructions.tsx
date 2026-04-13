import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CompanyInstructionsFileSummary } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Save,
} from "lucide-react";

type FileTreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: FileTreeNode[];
};

function buildTree(files: CompanyInstructionsFileSummary[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", kind: "dir", children: [] };
  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let next = current.children.find((c) => c.name === segment);
      if (!next) {
        next = { name: segment, path: currentPath, kind: isLeaf ? "file" : "dir", children: [] };
        current.children.push(next);
      }
      current = next;
    }
  }
  function sortNode(node: FileTreeNode) {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  }
  sortNode(root);
  return root.children;
}

export function CompanyInstructions() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;

  const [selectedFile, setSelectedFile] = useState("COMPANY.md");
  const [draft, setDraft] = useState<string | null>(null);
  const [newFilePath, setNewFilePath] = useState("");
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: "Settings", href: "/company/settings" },
      { label: "Instructions" },
    ]);
  }, [setBreadcrumbs]);

  const { data: bundle, isLoading } = useQuery({
    queryKey: queryKeys.companyInstructions.bundle(companyId),
    queryFn: () => companiesApi.instructionsBundle(companyId),
    enabled: !!companyId,
  });

  const files = bundle?.files ?? [];
  const entryFile = bundle?.entryFile ?? "COMPANY.md";
  const fileTree = useMemo(() => buildTree(files), [files]);
  const selectedOrEntry = selectedFile || entryFile;
  const selectedExists = files.some((f) => f.path === selectedOrEntry);

  const { data: fileDetail, isLoading: fileLoading } = useQuery({
    queryKey: queryKeys.companyInstructions.file(companyId, selectedOrEntry),
    queryFn: () => companiesApi.instructionsFile(companyId, selectedOrEntry),
    enabled: !!companyId && selectedExists,
  });

  const saveFile = useMutation({
    mutationFn: (data: { path: string; content: string }) =>
      companiesApi.saveInstructionsFile(companyId, data),
    onSuccess: (_, variables) => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInstructions.bundle(companyId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyInstructions.file(companyId, variables.path),
      });
    },
  });

  const deleteFile = useMutation({
    mutationFn: (relativePath: string) =>
      companiesApi.deleteInstructionsFile(companyId, relativePath),
    onSuccess: (_, relativePath) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInstructions.bundle(companyId) });
      queryClient.removeQueries({
        queryKey: queryKeys.companyInstructions.file(companyId, relativePath),
      });
      if (selectedFile === relativePath) {
        setSelectedFile(entryFile);
      }
    },
  });

  // Sync selected file when files change
  useEffect(() => {
    if (!bundle) return;
    const paths = bundle.files.map((f) => f.path);
    if (paths.length === 0) return;
    if (!paths.includes(selectedFile)) {
      setSelectedFile(paths.includes(entryFile) ? entryFile : paths[0]!);
    }
  }, [bundle, entryFile, selectedFile]);

  // Auto-expand dirs
  useEffect(() => {
    const next = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? `${cur}/${parts[i]}` : parts[i]!;
        next.add(cur);
      }
    }
    setExpandedDirs(next);
  }, [files]);

  // Reset draft when file changes
  useEffect(() => {
    setDraft(null);
  }, [selectedOrEntry]);

  const currentContent = selectedExists ? (fileDetail?.content ?? "") : "";
  const displayValue = draft ?? currentContent;
  const isDirty = draft !== null && draft !== currentContent;

  const handleSave = useCallback(() => {
    if (!isDirty) return;
    saveFile.mutate({ path: selectedOrEntry, content: displayValue });
  }, [isDirty, saveFile, selectedOrEntry, displayValue]);

  const handleCreateFile = useCallback(() => {
    const trimmed = newFilePath.trim();
    if (!trimmed) return;
    const normalized = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
    saveFile.mutate(
      { path: normalized, content: "" },
      {
        onSuccess: () => {
          setSelectedFile(normalized);
          setNewFilePath("");
          setShowNewFileInput(false);
        },
      },
    );
  }, [newFilePath, saveFile]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (isLoading) return <PageSkeleton variant="detail" />;

  function renderTreeNode(node: FileTreeNode, depth: number) {
    if (node.kind === "dir") {
      const isExpanded = expandedDirs.has(node.path);
      return (
        <div key={node.path}>
          <button
            className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 rounded transition-colors"
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => {
              setExpandedDirs((prev) => {
                const next = new Set(prev);
                if (isExpanded) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }}
          >
            {isExpanded ? (
              <>
                <ChevronDown className="h-3 w-3 shrink-0" />
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    const isSelected = selectedOrEntry === node.path;
    const isEntry = node.path === entryFile;
    return (
      <button
        key={node.path}
        className={`flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded transition-colors ${
          isSelected
            ? "bg-accent text-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => setSelectedFile(node.path)}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
        {isEntry && (
          <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
            entry
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Company Instructions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Markdown files shared across all agents in this company. The entry file ({entryFile}) is
            automatically prepended to every agent's instructions at runtime.
          </p>
        </div>
      </div>

      {files.length === 0 && !showNewFileInput ? (
        <EmptyState
          icon={FileText}
          message="No company instructions yet. Create a COMPANY.md file to add shared instructions for all agents."
          action="Create COMPANY.md"
          onAction={() => {
            saveFile.mutate(
              { path: "COMPANY.md", content: "# Company Instructions\n\nAdd shared instructions for all agents here.\n" },
              { onSuccess: () => setSelectedFile("COMPANY.md") },
            );
          }}
        />
      ) : (
        <div className="flex border border-border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
          {/* File tree sidebar */}
          <div className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Files
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                className="h-5 w-5"
                onClick={() => setShowNewFileInput(true)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {fileTree.map((node) => renderTreeNode(node, 0))}
              {showNewFileInput && (
                <div className="px-2 py-1">
                  <input
                    autoFocus
                    className="w-full rounded border border-border bg-transparent px-1.5 py-0.5 text-xs outline-none"
                    placeholder="path/file.md"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateFile();
                      if (e.key === "Escape") {
                        setShowNewFileInput(false);
                        setNewFilePath("");
                      }
                    }}
                    onBlur={() => {
                      if (!newFilePath.trim()) {
                        setShowNewFileInput(false);
                        setNewFilePath("");
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Editor panel */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">{selectedOrEntry}</span>
                {isDirty && <span className="text-amber-500">modified</span>}
              </div>
              <div className="flex items-center gap-1">
                {selectedOrEntry !== entryFile && selectedExists && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteFile.mutate(selectedOrEntry)}
                    disabled={deleteFile.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs px-2"
                  disabled={!isDirty || saveFile.isPending}
                  onClick={handleSave}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saveFile.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {fileLoading && selectedExists ? (
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
              ) : !selectedExists && files.length > 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  File does not exist yet. It will be created when you save.
                </div>
              ) : (
                <textarea
                  className="w-full h-full resize-none bg-transparent p-4 text-sm font-mono outline-none"
                  value={displayValue}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`# ${selectedOrEntry}\n\nWrite your instructions here...`}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
