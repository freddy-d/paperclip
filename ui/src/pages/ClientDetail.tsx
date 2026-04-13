import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClientProject } from "@paperclipai/shared";
import { CLIENT_STATUSES } from "@paperclipai/shared";
import { clientsApi } from "../api/clients";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { projectUrl } from "../lib/utils";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { LinkClientProjectDialog } from "../components/LinkClientProjectDialog";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FolderOpen, Mail, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";

type ClientDetailTab = "overview" | "projects";

export function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ClientDetailTab>("overview");
  const [editing, setEditing] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ClientProject | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | null>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: queryKeys.clients.detail(clientId!),
    queryFn: () => clientsApi.get(clientId!),
    enabled: !!clientId,
  });

  const {
    data: clientProjects,
    isLoading: projectsLoading,
  } = useQuery({
    queryKey: queryKeys.clients.projects(clientId!),
    queryFn: () => clientsApi.listProjects(clientId!),
    enabled: !!clientId && activeTab === "projects",
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Clients", href: "/clients" },
      { label: client?.name ?? "..." },
    ]);
  }, [setBreadcrumbs, client?.name]);

  const updateClient = useMutation({
    mutationFn: (data: Record<string, unknown>) => clientsApi.update(clientId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
      setEditing(false);
    },
  });

  const deleteClient = useMutation({
    mutationFn: () => clientsApi.remove(clientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
      navigate("/clients");
    },
  });

  const deleteClientProject = useMutation({
    mutationFn: (id: string) => clientsApi.removeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.projects(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(selectedCompanyId!) });
    },
  });

  if (isLoading || !client) {
    return <PageSkeleton variant="detail" />;
  }
  const currentClient = client;

  function startEditing() {
    setEditForm({
      name: currentClient.name,
      email: currentClient.email ?? "",
      phone: currentClient.phone ?? "",
      contactName: currentClient.contactName ?? "",
      notes: currentClient.notes ?? "",
      status: currentClient.status,
    });
    setEditing(true);
  }

  function handleSave() {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editForm)) {
      patch[key] = value === "" ? null : value;
    }
    if (editForm.name) patch.name = editForm.name.trim();
    updateClient.mutate(patch);
  }

  const linkedProjectCount = currentClient.linkedProjectCount ?? clientProjects?.length ?? 0;
  const activeProjectCount =
    currentClient.activeProjectCount ??
    (clientProjects ?? []).filter((project) => project.status === "active").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{currentClient.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  External relationship record linked to company work.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={currentClient.status} />
                {!editing ? (
                  <Button size="sm" variant="ghost" onClick={startEditing}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Primary contact</div>
                <div className="mt-1 text-sm font-medium">{currentClient.contactName ?? "Not set"}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Linked projects</div>
                <div className="mt-1 text-sm font-medium">{linkedProjectCount}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted-foreground">Active relationships</div>
                <div className="mt-1 text-sm font-medium">{activeProjectCount}</div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ClientDetailTab)} className="space-y-4">
        <TabsList variant="line" className="justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relationship Details</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={editForm.name ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={editForm.status ?? "active"}
                        onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Primary contact</Label>
                      <Input
                        value={editForm.contactName ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        value={editForm.email ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={editForm.phone ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={editForm.notes ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Relationship context, communication preferences, or operator reminders..."
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!editForm.name?.trim() || updateClient.isPending}
                    >
                      {updateClient.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                  {updateClient.isError ? (
                    <p className="text-xs text-destructive">Failed to update client.</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Primary contact</div>
                      <div className="text-sm">{currentClient.contactName ?? "Not set"}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="text-sm">{currentClient.email ?? "Not set"}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="text-sm">{currentClient.phone ?? "Not set"}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed border-border px-3 py-3">
                    <div className="text-xs text-muted-foreground">Relationship notes</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {currentClient.notes ?? "No notes added yet."}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked Projects</CardTitle>
              <CardAction>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingProject(null);
                    setLinkDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Link Project
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <PageSkeleton variant="list" />
              ) : null}

              {!projectsLoading && (clientProjects ?? []).length === 0 ? (
                <EmptyState
                  icon={FolderOpen}
                  message="No projects linked to this client."
                  action="Link Project"
                  onAction={() => {
                    setEditingProject(null);
                    setLinkDialogOpen(true);
                  }}
                />
              ) : null}

              {!projectsLoading && (clientProjects ?? []).length > 0 ? (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {clientProjects!.map((project) => (
                    <div key={project.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={projectUrl({
                              id: project.projectId,
                              name: project.projectName ?? project.projectNameOverride ?? "project",
                            })}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {project.projectNameOverride || project.projectName || "Unnamed project"}
                          </Link>
                          <StatusBadge status={project.status} />
                        </div>
                        {project.description ? (
                          <p className="text-sm text-muted-foreground">{project.description}</p>
                        ) : null}
                        {(project.tags ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {project.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingProject(project);
                            setLinkDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteClientProject.mutate(project.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          {!confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Client
            </Button>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                Delete this client and all linked project relationships? This cannot be undone.
              </p>
              <div className="ml-4 flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteClient.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteClient.mutate()}
                  disabled={deleteClient.isPending}
                >
                  {deleteClient.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LinkClientProjectDialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) setEditingProject(null);
        }}
        clientId={clientId!}
        companyId={selectedCompanyId!}
        editingProject={editingProject ?? undefined}
      />
    </div>
  );
}
