import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { InstructionsBundleEditor } from "../components/InstructionsBundleEditor";

export function CompanyInstructions() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId!;
  const [selectedFile, setSelectedFile] = useState("COMPANY.md");

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

  const entryFile = bundle?.entryFile ?? "COMPANY.md";
  const { data: fileDetail, isLoading: fileLoading } = useQuery({
    queryKey: queryKeys.companyInstructions.file(companyId, selectedFile),
    queryFn: () => companiesApi.instructionsFile(companyId, selectedFile),
    enabled: !!companyId && !!bundle?.files.some((file) => file.path === selectedFile),
  });

  const saveFile = useMutation({
    mutationFn: (data: { path: string; content: string }) =>
      companiesApi.saveInstructionsFile(companyId, data),
    onSuccess: (_, variables) => {
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
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" />;

  return (
    <InstructionsBundleEditor
      title="Company Instructions"
      description={`Markdown files shared across all agents in this company. The entry file (${entryFile}) is automatically prepended to every agent's instructions at runtime.`}
      files={bundle?.files ?? []}
      entryFile={entryFile}
      fileDetail={fileDetail}
      fileLoading={fileLoading}
      savePending={saveFile.isPending}
      deletePending={deleteFile.isPending}
      selectedFile={selectedFile}
      onSelectedFileChange={setSelectedFile}
      emptyMessage="No company instructions yet. Create a COMPANY.md file to add shared instructions for all agents."
      emptyAction="Create COMPANY.md"
      emptyFilePath="COMPANY.md"
      emptyFileContent=""
      onSaveFile={(data, opts) => {
        saveFile.mutate(data, {
          onSuccess: () => {
            opts?.onSuccess?.();
          },
        });
      }}
      onDeleteFile={(relativePath) => deleteFile.mutate(relativePath)}
    />
  );
}
